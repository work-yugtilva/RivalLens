import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  costForAttempt,
  costForSuite,
  estimatedCostPerRun,
  loadPricing,
  resolvePricing,
} from '../../packages/eval/src/pricing/pricing';

const TABLE = loadPricing({
  pricingVersion: 'test',
  entries: [
    {
      providerId: 'anthropic',
      modelId: 'model-x',
      effectiveFrom: '2026-01-01',
      inputCostPerMillionTokens: 3,
      outputCostPerMillionTokens: 15,
    },
    {
      providerId: 'anthropic',
      modelId: 'model-x',
      effectiveFrom: '2026-06-01',
      inputCostPerMillionTokens: 2,
      outputCostPerMillionTokens: 10,
    },
  ],
});

describe('evaluation pricing', () => {
  it('resolves the latest entry effective on or before the date', () => {
    expect(resolvePricing(TABLE, 'anthropic', 'model-x', '2026-03-01')?.inputCostPerMillionTokens).toBe(3);
    expect(resolvePricing(TABLE, 'anthropic', 'model-x', '2026-09-01')?.inputCostPerMillionTokens).toBe(2);
  });

  it('returns null when nothing is effective yet or the model is unknown', () => {
    expect(resolvePricing(TABLE, 'anthropic', 'model-x', '2025-12-31')).toBeNull();
    expect(resolvePricing(TABLE, 'openai', 'model-x', '2026-09-01')).toBeNull();
  });

  it('never guesses: null pricing or null tokens => null cost', () => {
    const entry = resolvePricing(TABLE, 'anthropic', 'model-x', '2026-09-01');
    expect(costForAttempt(null, 100, 200)).toBeNull();
    expect(costForAttempt(entry, null, 200)).toBeNull();
    expect(costForAttempt(entry, 100, null)).toBeNull();
    expect(costForAttempt(entry, 1_000_000, 1_000_000)).toBeCloseTo(12);
  });

  it('sums attempt costs, and nullifies the run if any attempt cost is unknown', () => {
    const entry = resolvePricing(TABLE, 'anthropic', 'model-x', '2026-09-01');
    expect(
      estimatedCostPerRun(
        [
          { inputTokens: 1_000_000, outputTokens: 0 },
          { inputTokens: 0, outputTokens: 1_000_000 },
        ],
        entry,
      ),
    ).toBeCloseTo(12);
    expect(
      estimatedCostPerRun([{ inputTokens: 1_000_000, outputTokens: null }], entry),
    ).toBeNull();
    expect(estimatedCostPerRun([{ inputTokens: 1, outputTokens: 1 }], null)).toBeNull();
  });

  it('aggregates a suite cost with a known/unknown split', () => {
    expect(costForSuite([1, 2, null, 3])).toEqual({ knownUsd: 6, unknownRuns: 1 });
    expect(costForSuite([1, 2, null], { strict: true })).toBeNull();
    expect(costForSuite([1, 2, 3], { strict: true })).toEqual({ knownUsd: 6, unknownRuns: 0 });
  });

  it('loads the committed pricing table (mock priced at zero; no guessed candidate prices)', () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '../../packages/eval/pricing/model-pricing.json'), 'utf8'),
    ) as unknown;
    const table = loadPricing(raw);
    expect(table.pricingVersion).toBeTruthy();
    expect(resolvePricing(table, 'deterministic-mock', 'phase-3a', '2026-09-09')).not.toBeNull();
    expect(resolvePricing(table, 'deterministic-mock', 'phase-3a', '2026-09-09')?.inputCostPerMillionTokens).toBe(0);
  });
});
