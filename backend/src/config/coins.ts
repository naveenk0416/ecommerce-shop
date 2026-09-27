import '../utils/env.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Coin wallet settings, read once at startup from backend/config/coins.json (or COIN_CONFIG_PATH).
 * Every amount, limit and price lives there so it can be changed without a code change.
 * COIN_PACKS_ENABLED=true|false in the .env overrides packs.enabled.
 */
export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  priceInr: number;
  startsAt?: string;
  endsAt?: string;
}

export interface CoinConfig {
  listingCost: number;
  welcomeBonus: number;
  monthlyFreeTopUpTo: number;
  timezone: string;
  earnedBonuses: { mobile: number; firstInventorySave: number; firstPublish: number };
  mobileBonusOnSignup: boolean;
  referral: { reward: number; maxRewardsPerReferrerPerMonth: number; reverseIfDeletedWithinDays: number; baseUrl: string };
  freeAssists: { fieldFixPerListing: number; autofillPerListingPerMarketplace: number; perUserPerDay: number };
  ai: {
    listingModel: string;
    /** MINIMAL | LOW | MEDIUM | HIGH — lower is faster. */
    listingThinkingLevel: string;
    listingMaxOutputTokens: number;
    assistModel: string;
    assistThinkingLevel: string;
    fieldFixMaxOutputTokens: number;
    /** Send one backup field-fix request if the first takes longer than this (0 = off). */
    fieldFixHedgeAfterMs: number;
    /** At most this many backup field-fix requests. */
    fieldFixMaxBackups: number;
    autofillMaxOutputTokens: number;
    usdToInr: number;
    pricePerMillionTokensUsd: Record<string, { input: number; output: number }>;
  };
  autofillBlockedFieldPatterns: string[];
  packs: {
    enabled: boolean;
    regular: CoinPack[];
    starter: CoinPack & { offerHours: number };
    festive: CoinPack[];
    lowBalanceThreshold: number;
  };
  timeSavedMinutes: { aiListing: number; marketplaceAutofill: number; gstLookup: number };
  catalogSizeBands: string[];
}

const DEFAULTS: CoinConfig = {
  listingCost: 1,
  welcomeBonus: 10,
  monthlyFreeTopUpTo: 3,
  timezone: 'Asia/Kolkata',
  earnedBonuses: { mobile: 2, firstInventorySave: 3, firstPublish: 5 },
  mobileBonusOnSignup: true,
  referral: { reward: 10, maxRewardsPerReferrerPerMonth: 20, reverseIfDeletedWithinDays: 7, baseUrl: 'https://sellassist.in/' },
  freeAssists: { fieldFixPerListing: 10, autofillPerListingPerMarketplace: 3, perUserPerDay: 60 },
  ai: {
    listingModel: 'gemini-3.1-flash-lite',
    listingThinkingLevel: 'MINIMAL',
    listingMaxOutputTokens: 12000,
    assistModel: 'gemini-3.1-flash-lite',
    assistThinkingLevel: 'MINIMAL',
    fieldFixMaxOutputTokens: 400,
    fieldFixHedgeAfterMs: 2000,
    fieldFixMaxBackups: 2,
    autofillMaxOutputTokens: 1500,
    usdToInr: 88,
    pricePerMillionTokensUsd: {},
  },
  autofillBlockedFieldPatterns: [],
  packs: {
    enabled: false,
    regular: [],
    starter: { id: 'starter', name: 'Starter pack', coins: 20, priceInr: 49, offerHours: 48 },
    festive: [],
    lowBalanceThreshold: 3,
  },
  timeSavedMinutes: { aiListing: 20, marketplaceAutofill: 10, gstLookup: 2 },
  catalogSizeBands: ['1-10', '11-50', '51-200', '200+'],
};

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (key.startsWith('_')) continue;
    const current = (base as any)[key];
    out[key] = current && typeof current === 'object' && !Array.isArray(current) && value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(current, value)
      : value;
  }
  return out;
}

function loadConfig(): CoinConfig {
  const path = process.env['COIN_CONFIG_PATH'] || fileURLToPath(new URL('../../config/coins.json', import.meta.url));
  let fileConfig: unknown = {};
  if (existsSync(path)) {
    try {
      fileConfig = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      console.error(`[coins] Could not parse ${path} — using built-in defaults.`, err);
    }
  }
  const config = deepMerge(DEFAULTS, fileConfig);
  const envPacks = process.env['COIN_PACKS_ENABLED'];
  if (envPacks !== undefined && envPacks !== '') config.packs.enabled = /^(1|true|yes|on)$/i.test(envPacks.trim());
  return config;
}

export const coinConfig: CoinConfig = loadConfig();

/** Tests flip packs on/off without restarting. */
export function setPacksEnabledForTests(enabled: boolean): void {
  coinConfig.packs.enabled = enabled;
}

// ---- Calendar helpers (all in the configured timezone, Asia/Kolkata by default) ----

function zonedParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: coinConfig.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** "2026-09" */
export function monthKey(date = new Date()): string {
  const { year, month } = zonedParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "2026-09-27" */
export function dayKey(date = new Date()): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Start of the current month in the configured timezone, as a UTC Date (IST is a fixed +05:30). */
export function monthStart(date = new Date()): Date {
  const { year, month } = zonedParts(date);
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`);
}

/** 1st of next month, 00:00 in the configured timezone — when the free top-up happens. */
export function nextTopUpDate(date = new Date()): Date {
  const { year, month } = zonedParts(date);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+05:30`);
}

// ---- Packs ----

export function activeFestivePacks(now = new Date()): CoinPack[] {
  return coinConfig.packs.festive.filter((p) => {
    const start = p.startsAt ? new Date(p.startsAt).getTime() : -Infinity;
    const end = p.endsAt ? new Date(p.endsAt).getTime() : Infinity;
    return now.getTime() >= start && now.getTime() <= end;
  });
}

// ---- Fields the AI must never fill ----

function normalizeFieldName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/**
 * True for manufacturer/importer/origin/MRP/weight/dimensions/GTIN/brand/compliance fields.
 * Patterns match at the start of a word ("ean" blocks "ean_code" but not "cleaning_instructions").
 */
export function isBlockedAutofillField(key: string, label = ''): boolean {
  const haystack = `_${normalizeFieldName(key)}_${normalizeFieldName(label)}_`;
  return coinConfig.autofillBlockedFieldPatterns.some((pattern) => haystack.includes(`_${normalizeFieldName(pattern)}`));
}
