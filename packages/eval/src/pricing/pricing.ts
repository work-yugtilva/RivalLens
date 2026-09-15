import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Evaluation pricing is EXTERNAL to provider adapter logic (adapters always report
// estimatedCostUsd = null). Costs are derived here from token counts and a versioned
// pricing table. Unknown price or unknown tokens => null cost. Never guess a price.

export const pricingEntrySchema = z
  .object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be an ISO date (YYYY-MM-DD)'),
    inputCostPerMillionTokens: z.number().nonnegative(),
    outputCostPerMillionTokens: z.number().nonnegative(),
  })
  .strict();

export const pricingTableSchema = z
  .object({
    pricingVersion: z.string().min(1),
    note: z.string().optional(),
    entries: z.array(pricingEntrySchema),
  })
  .strict();

export type PricingEntry = z.infer<typeof pricingEntrySchema>;
export type PricingTable = z.infer<typeof pricingTableSchema>;

export function loadPricing(raw: unknown): PricingTable {
  const table = pricingTableSchema.parse(raw);
  return {
    ...table,
    entries: [...table.entries].sort(
      (a, b) =>
        a.providerId.localeCompare(b.providerId) ||
        a.modelId.localeCompare(b.modelId) ||
        a.effectiveFrom.localeCompare(b.effectiveFrom),
    ),
  };
}

/** Latest entry whose effectiveFrom is on or before `at` (YYYY-MM-DD), or null. */
export function resolvePricing(
  table: PricingTable,
  providerId: string,
  modelId: string,
  at: string,
): PricingEntry | null {
  const candidates = table.entries.filter(
    (entry) => entry.providerId === providerId && entry.modelId === modelId && entry.effectiveFrom <= at,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, entry) => (entry.effectiveFrom >= best.effectiveFrom ? entry : best));
}

export function costForAttempt(
  entry: PricingEntry | null,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (entry === null || inputTokens === null || outputTokens === null) return null;
  return (
    (inputTokens / 1_000_000) * entry.inputCostPerMillionTokens +
    (outputTokens / 1_000_000) * entry.outputCostPerMillionTokens
  );
}

export type AttemptTokens = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
};

/** Sum of attempt costs. If any attempt cost is null (no pricing or missing tokens), the run cost is null. */
export function estimatedCostPerRun(
  attempts: readonly AttemptTokens[],
  entry: PricingEntry | null,
): number | null {
  if (entry === null) return null;
  let total = 0;
  for (const attempt of attempts) {
    const attemptCost = costForAttempt(entry, attempt.inputTokens, attempt.outputTokens);
    if (attemptCost === null) return null;
    total += attemptCost;
  }
  return total;
}

/** One orchestration == one report. */
export const estimatedCostPerReport = estimatedCostPerRun;

export type SuiteCost = { readonly knownUsd: number; readonly unknownRuns: number };

export function costForSuite(
  runCosts: readonly (number | null)[],
  options: { readonly strict?: boolean } = {},
): SuiteCost | null {
  const unknownRuns = runCosts.filter((cost) => cost === null).length;
  if (options.strict && unknownRuns > 0) return null;
  const knownUsd = runCosts.reduce<number>((sum, cost) => (cost === null ? sum : sum + cost), 0);
  return { knownUsd, unknownRuns };
}

export const PRICING_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'pricing',
  'model-pricing.json',
);

export function loadPricingFromDisk(path: string = PRICING_PATH): PricingTable {
  return loadPricing(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}
