import { SeoScoreCriterion } from './seo-score-card';

export interface SeoCheck {
  label: string;
  test: (getValue: (key: string) => string) => boolean;
  /** The field this check is about — Readiness links straight to it. */
  field?: string;
  /** A failed blocking check means the marketplace needs attention, whatever the score. */
  blocking?: boolean;
}

/** Deterministically scores a generated field set against a list of pass/fail checks. */
export function computeSeoScore(
  result: Record<string, { values: string[] }>,
  checks: readonly SeoCheck[],
): { score: number; criteria: SeoScoreCriterion[] } {
  const getValue = (key: string) => result[key]?.values?.[0] ?? '';
  const criteria: SeoScoreCriterion[] = checks.map((check) => ({
    label: check.label,
    passed: check.test(getValue),
  }));
  const passedCount = criteria.filter((c) => c.passed).length;
  const score = criteria.length ? Math.round((passedCount / criteria.length) * 100) : 0;
  return { score, criteria };
}
