import './env.js';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AiUsage } from '../api/common.js';
import { coinConfig } from '../config/coins.js';

/**
 * All Gemini calls go through the backend (the key lives only in the backend .env as
 * GEMINI_API_KEY), so coins and free-assist limits can be enforced and every call is logged in
 * AiUsage with its token counts and estimated cost.
 */
export interface GeminiRequest {
  model: string;
  prompt: string;
  image?: { data: string; mimeType: string };
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Cheap/fast calls (field fixes, marketplace auto-fill) skip most of the model's thinking. */
  minimalThinking?: boolean;
}

export interface GeminiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type GeminiGenerator = (req: GeminiRequest) => Promise<GeminiResult>;

let client: GoogleGenAI | null = null;

const realGenerator: GeminiGenerator = async (req) => {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) throw new Error('AI is not configured on the server (GEMINI_API_KEY is missing).');
  client ??= new GoogleGenAI({ apiKey });
  const parts: Array<Record<string, unknown>> = [{ text: req.prompt }];
  if (req.image) parts.push({ inlineData: { data: req.image.data, mimeType: req.image.mimeType } });
  const response = await client.models.generateContent({
    model: req.model,
    contents: [{ role: 'user', parts }],
    config: {
      ...(req.schema ? { responseMimeType: 'application/json', responseSchema: req.schema } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      ...(req.minimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
    },
  });
  const usage = response.usageMetadata;
  return {
    text: response.text ?? '',
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
};

let generator: GeminiGenerator = realGenerator;

/** Tests replace the real Gemini call with a canned response. */
export function setGeminiGeneratorForTests(fn: GeminiGenerator | null): void {
  generator = fn ?? realGenerator;
}

export function estimateCostInr(model: string, inputTokens: number, outputTokens: number): number {
  const price = coinConfig.ai.pricePerMillionTokensUsd[model];
  if (!price) return 0;
  const usd = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
  return Math.round(usd * coinConfig.ai.usdToInr * 10000) / 10000;
}

/** Short, human message for a Gemini SDK error (which is often a raw JSON body). */
export function friendlyGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'))) as { error?: { status?: string; message?: string } };
    if (parsed.error?.status === 'RESOURCE_EXHAUSTED') return 'The AI is busy right now. Please try again in a minute.';
    if (parsed.error?.status === 'UNAVAILABLE') return 'SellAssist AI is temporarily overloaded. Please try again in a moment.';
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — use the raw message.
  }
  return raw || 'The AI request failed. Please try again.';
}

export class AiCallError extends Error {}

/**
 * Makes one Gemini call and logs it. Returns the parsed JSON (when a schema was given) or text.
 * Throws AiCallError with a friendly message on failure (the failure is logged too).
 */
export async function callGemini(uid: string, purpose: 'listing' | 'field_fix' | 'marketplace_autofill', req: GeminiRequest, log: {
  listingKey?: string; marketplace?: string; coinsCharged?: number;
} = {}): Promise<unknown> {
  const started = { uid, purpose, model: req.model, listingKey: log.listingKey, marketplace: log.marketplace };
  let result: GeminiResult;
  try {
    result = await generator(req);
    if (!result.text) throw new Error('The AI returned an empty response. Please try again.');
  } catch (err) {
    const message = friendlyGeminiError(err);
    await AiUsage.create({ ...started, success: false, error: message.slice(0, 300) }).catch(() => undefined);
    throw new AiCallError(message);
  }

  let parsed: unknown = result.text;
  if (req.schema) {
    try {
      parsed = JSON.parse(result.text);
    } catch {
      await AiUsage.create({
        ...started, success: false, error: 'Unparseable AI response',
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        costInr: estimateCostInr(req.model, result.inputTokens, result.outputTokens),
      }).catch(() => undefined);
      throw new AiCallError('The AI response was cut short. Please try again.');
    }
  }

  await AiUsage.create({
    ...started,
    success: true,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costInr: estimateCostInr(req.model, result.inputTokens, result.outputTokens),
    coinsCharged: log.coinsCharged ?? 0,
  });
  return parsed;
}
