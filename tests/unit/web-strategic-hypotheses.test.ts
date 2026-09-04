import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STRATEGIC_HYPOTHESIS_CANONICAL_COPY } from '../../packages/schemas/src';

const mocks = vi.hoisted(() => ({
  loadCurrent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../apps/web/src/lib/internal/competitive-signals', () => ({
  loadCurrentPersistedCompetitiveSignals: mocks.loadCurrent,
}));

import {
  generateStrategicHypotheses,
  hydrateHypothesisRows,
  hydratePersistedHypotheses,
} from '../../apps/web/src/lib/internal/strategic-hypotheses';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const HYPOTHESIS_ID = '33333333-3333-4333-8333-333333333333';
const SIGNAL_ID = '44444444-4444-4444-8444-444444444444';
const TIMESTAMP = '2026-09-04T12:00:00.000Z';
const HYPOTHESIS_HASH = `sha256:${'a'.repeat(64)}`;

function persistedInput() {
  const copy = STRATEGIC_HYPOTHESIS_CANONICAL_COPY.competitor_may_reduce_shipping_friction;
  return {
    expectedHypothesisHashes: [HYPOTHESIS_HASH],
    rpcRows: [
      { id: HYPOTHESIS_ID, hypothesis_hash: HYPOTHESIS_HASH, inserted: false },
    ],
    hypothesisRows: [
      {
        id: HYPOTHESIS_ID,
        owned_brand_id: BRAND_ID,
        competitor_id: COMPETITOR_ID,
        hypothesis_type: 'competitor_may_reduce_shipping_friction',
        statement: copy.statement,
        rationale: copy.rationale,
        confidence: 'medium',
        uncertainty_category: copy.uncertainty.category,
        uncertainty_statement: copy.uncertainty.statement,
        generated_at: TIMESTAMP,
        hypothesis_engine_version: 'strategic-hypotheses-v1',
        generation_provenance: {
          method: 'deterministic_template',
          templateId: 'competitor_may_reduce_shipping_friction',
          sourceSignalRuleVersion: 'competitive-signals-v1',
        },
        hypothesis_hash: HYPOTHESIS_HASH,
      },
    ],
    signalRows: [
      { hypothesis_id: HYPOTHESIS_ID, position: 0, signal_id: SIGNAL_ID },
    ],
  };
}

describe('strategic hypothesis persistence hydration', () => {
  it('hydrates immutable replay rows with every supporting signal ID', () => {
    expect(hydratePersistedHypotheses(persistedInput())).toMatchObject([
      {
        id: HYPOTHESIS_ID,
        hypothesisType: 'competitor_may_reduce_shipping_friction',
        supportingSignalIds: [SIGNAL_ID],
        generatedAt: TIMESTAMP,
        hypothesisHash: HYPOTHESIS_HASH,
      },
    ]);
  });

  it('orders supporting signal IDs by their persisted position', () => {
    const input = persistedInput();
    const firstSignalId = '00000000-0000-4000-8000-000000000001';
    const secondSignalId = '00000000-0000-4000-8000-000000000002';
    input.signalRows = [
      { hypothesis_id: HYPOTHESIS_ID, position: 1, signal_id: secondSignalId },
      { hypothesis_id: HYPOTHESIS_ID, position: 0, signal_id: firstSignalId },
    ];

    expect(
      hydrateHypothesisRows({
        hypothesisRows: input.hypothesisRows,
        signalRows: input.signalRows,
      })[0]?.supportingSignalIds,
    ).toEqual([firstSignalId, secondSignalId]);
  });

  it('rejects duplicate positions and duplicate supporting signal IDs', () => {
    const duplicatePosition = persistedInput();
    duplicatePosition.signalRows.push({
      hypothesis_id: HYPOTHESIS_ID,
      position: 0,
      signal_id: '55555555-5555-4555-8555-555555555555',
    });
    expect(() => hydratePersistedHypotheses(duplicatePosition)).toThrow(
      'duplicate signal positions',
    );

    const duplicateSignal = persistedInput();
    duplicateSignal.signalRows.push({
      hypothesis_id: HYPOTHESIS_ID,
      position: 1,
      signal_id: SIGNAL_ID,
    });
    expect(() => hydratePersistedHypotheses(duplicateSignal)).toThrow(
      'duplicate supporting signals',
    );
  });

  it('rejects incomplete or malformed persistence readback', () => {
    const missing = persistedInput();
    missing.hypothesisRows = [];
    expect(() => hydratePersistedHypotheses(missing)).toThrow('mismatched result');

    const malformed = persistedInput();
    malformed.rpcRows[0] = {
      id: HYPOTHESIS_ID,
      hypothesis_hash: HYPOTHESIS_HASH,
      inserted: 'false',
    } as never;
    expect(() => hydratePersistedHypotheses(malformed)).toThrow();
  });
});

describe('generateStrategicHypotheses web service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(['brand_not_found', 'competitors_not_found'] as const)(
    'preserves the tenant authorization result %s',
    async (status) => {
      mocks.loadCurrent.mockResolvedValueOnce({ status });

      await expect(
        generateStrategicHypotheses({} as never, {
          brandId: BRAND_ID,
          competitorIds: [COMPETITOR_ID],
          generatedAt: TIMESTAMP,
        }),
      ).resolves.toEqual({ status });
    },
  );

  it('does not generate or persist a signal when the current persisted set is empty', async () => {
    mocks.loadCurrent.mockResolvedValueOnce({ status: 'ok', signals: [] });

    await expect(
      generateStrategicHypotheses({} as never, {
        brandId: BRAND_ID,
        competitorIds: [COMPETITOR_ID],
        generatedAt: TIMESTAMP,
      }),
    ).resolves.toEqual({ status: 'ok', hypotheses: [] });
    expect(mocks.loadCurrent).toHaveBeenCalledWith(expect.anything(), {
      brandId: BRAND_ID,
      competitorIds: [COMPETITOR_ID],
      generatedAt: TIMESTAMP,
    });
  });
});
