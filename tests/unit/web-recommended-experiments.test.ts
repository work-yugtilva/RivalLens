import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateRecommendedExperiments as generateCandidates,
  generateStrategicHypotheses,
} from '../../packages/intelligence/src';
import { strategicHypothesisSchema, type CompetitiveSignal } from '../../packages/schemas/src';

const mocks = vi.hoisted(() => ({ loadCurrent: vi.fn(), loadHistoricalSignals: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../apps/web/src/lib/internal/strategic-hypotheses', () => ({
  loadCurrentStrategicHypotheses: mocks.loadCurrent,
}));
vi.mock('../../apps/web/src/lib/internal/competitive-signals', () => ({
  loadHistoricalCompetitiveSignals: mocks.loadHistoricalSignals,
}));

import {
  generateRecommendedExperiments,
  hydrateExperimentRows,
  hydratePersistedExperiments,
} from '../../apps/web/src/lib/internal/recommended-experiments';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const SIGNAL_ID = '33333333-3333-4333-8333-333333333333';
const HYPOTHESIS_ID = '44444444-4444-4444-8444-444444444444';
const EXPERIMENT_ID = '55555555-5555-4555-8555-555555555555';
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

const shippingSignal: CompetitiveSignal = {
  id: SIGNAL_ID,
  signalType: 'competitor_lower_free_shipping_threshold',
  ownedBrandId: BRAND_ID,
  competitorId: COMPETITOR_ID,
  comparisonKey: 'offer.free_shipping_threshold',
  statement: 'Competitor threshold is lower.',
  supportingValues: { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
  confidence: 'high',
  evidence: [
    {
      role: 'competitor',
      sourceId: '66666666-6666-4666-8666-666666666666',
      snapshotId: '77777777-7777-4777-8777-777777777777',
      observationId: '88888888-8888-4888-8888-888888888888',
      confidence: 0.95,
    },
  ],
  generatedAt: GENERATED_AT,
  ruleVersion: 'competitive-signals-v1',
  signalHash: `sha256:${'a'.repeat(64)}`,
};

const shippingHypothesis = strategicHypothesisSchema.parse({
  id: HYPOTHESIS_ID,
  ...generateStrategicHypotheses({
    currentSignals: [shippingSignal],
    generatedAt: GENERATED_AT,
  })[0]!,
});
const shippingExperiment = generateCandidates({
  currentHypotheses: [shippingHypothesis],
  supportingSignals: [shippingSignal],
  generatedAt: GENERATED_AT,
})[0]!;

function persistedRows() {
  return {
    expectedExperimentHashes: [shippingExperiment.experimentHash],
    rpcRows: [
      { id: EXPERIMENT_ID, experiment_hash: shippingExperiment.experimentHash, inserted: false },
    ],
    experimentRows: [
      {
        id: EXPERIMENT_ID,
        owned_brand_id: BRAND_ID,
        competitor_id: COMPETITOR_ID,
        experiment_type: shippingExperiment.experimentType,
        title: shippingExperiment.title,
        objective: shippingExperiment.objective,
        hypothesis_under_test: shippingExperiment.hypothesisUnderTest,
        design: shippingExperiment.design,
        control_configuration: shippingExperiment.control,
        treatment_configuration: shippingExperiment.treatment,
        primary_metric: shippingExperiment.primaryMetric,
        guardrail_metrics: shippingExperiment.guardrailMetrics,
        duration_planning: shippingExperiment.durationPlanning,
        implementation_notes: shippingExperiment.implementationNotes,
        confidence_level: shippingExperiment.confidence.level,
        confidence_basis: shippingExperiment.confidence.basis,
        caveat_category: shippingExperiment.caveat.category,
        caveat_statement: shippingExperiment.caveat.statement,
        generated_at: shippingExperiment.generatedAt,
        experiment_engine_version: shippingExperiment.experimentEngineVersion,
        generation_provenance: shippingExperiment.generationProvenance,
        experiment_hash: shippingExperiment.experimentHash,
      },
    ],
    hypothesisRows: [{ experiment_id: EXPERIMENT_ID, position: 0, hypothesis_id: HYPOTHESIS_ID }],
  };
}

describe('recommended experiment persistence hydration', () => {
  it('hydrates an immutable replay with every ordered hypothesis ID', () => {
    expect(hydratePersistedExperiments(persistedRows())).toMatchObject([
      {
        id: EXPERIMENT_ID,
        sourceHypothesisIds: [HYPOTHESIS_ID],
        experimentHash: shippingExperiment.experimentHash,
      },
    ]);
  });

  it('rejects duplicate positions, duplicate IDs, and incomplete RPC readback', () => {
    const duplicatePosition = persistedRows();
    duplicatePosition.hypothesisRows.push({
      experiment_id: EXPERIMENT_ID,
      position: 0,
      hypothesis_id: '99999999-9999-4999-8999-999999999999',
    });
    expect(() => hydrateExperimentRows(duplicatePosition)).toThrow(
      'duplicate hypothesis positions',
    );

    const duplicateId = persistedRows();
    duplicateId.hypothesisRows.push({
      experiment_id: EXPERIMENT_ID,
      position: 1,
      hypothesis_id: HYPOTHESIS_ID,
    });
    expect(() => hydrateExperimentRows(duplicateId)).toThrow('duplicate supporting hypotheses');

    const missing = persistedRows();
    missing.experimentRows = [];
    expect(() => hydratePersistedExperiments(missing)).toThrow('mismatched result');
  });
});

describe('recommended experiment service eligibility boundary', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['brand_not_found', 'competitors_not_found'] as const)(
    'preserves %s authorization',
    async (status) => {
      mocks.loadCurrent.mockResolvedValueOnce({ status });
      await expect(
        generateRecommendedExperiments({} as never, {
          brandId: BRAND_ID,
          competitorIds: [COMPETITOR_ID],
          generatedAt: GENERATED_AT,
        }),
      ).resolves.toEqual({ status });
    },
  );

  it('does not dereference or persist when no current persisted hypotheses are eligible', async () => {
    mocks.loadCurrent.mockResolvedValueOnce({
      status: 'ok',
      projection: {
        hypothesisEngineVersion: 'strategic-hypotheses-v1',
        hypotheses: [],
        unresolved: [
          {
            logicalIdentity: {
              ownedBrandId: BRAND_ID,
              competitorId: COMPETITOR_ID,
              hypothesisType: 'competitor_may_reduce_shipping_friction',
            },
            state: 'unknown',
            unresolvedSignalDependencies: [],
          },
        ],
        generationNeeded: [],
      },
    });
    await expect(
      generateRecommendedExperiments({} as never, {
        brandId: BRAND_ID,
        competitorIds: [COMPETITOR_ID],
        generatedAt: GENERATED_AT,
      }),
    ).resolves.toEqual({ status: 'ok', experiments: [] });
    expect(mocks.loadHistoricalSignals).not.toHaveBeenCalled();
  });

  it('treats missing linked signal lineage as an integrity failure', async () => {
    mocks.loadCurrent.mockResolvedValueOnce({
      status: 'ok',
      projection: {
        hypothesisEngineVersion: 'strategic-hypotheses-v1',
        hypotheses: [shippingHypothesis],
        unresolved: [],
        generationNeeded: [],
      },
    });
    mocks.loadHistoricalSignals.mockResolvedValueOnce({ status: 'ok', signals: [] });
    await expect(
      generateRecommendedExperiments({} as never, {
        brandId: BRAND_ID,
        competitorIds: [COMPETITOR_ID],
        generatedAt: GENERATED_AT,
      }),
    ).rejects.toThrow('lineage is incomplete');
  });
});
