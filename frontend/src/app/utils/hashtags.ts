/** Instagram allows at most 30 hashtags per post; we generate 20 to leave room for the seller's own. */
export const INSTAGRAM_HASHTAG_LIMIT = 20;
export const INSTAGRAM_MAX_HASHTAGS = 30;

/**
 * Normalises AI hashtag output: splits on spaces/commas, adds a leading "#", drops empties and
 * case-insensitive duplicates (and anything in `exclude`), then caps at `limit`. Enforced in code
 * because the model doesn't reliably follow the count in the prompt.
 */
export function normalizeHashtags(input: string | string[] | null | undefined, limit = INSTAGRAM_HASHTAG_LIMIT, exclude: Iterable<string> = []): string[] {
  const raw = Array.isArray(input) ? input.join(' ') : String(input ?? '');
  const seen = new Set(Array.from(exclude, (t) => t.toLowerCase()));
  const out: string[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    const tag = token.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!tag) continue;
    const key = `#${tag}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${tag}`);
    if (out.length >= limit) break;
  }
  return out;
}
