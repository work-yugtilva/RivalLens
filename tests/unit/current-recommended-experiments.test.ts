import { describe, expect, it } from 'vitest';
import {
  currentCompetitiveSignalLogicalIdentity,
  resolveCurrentRecommendedExperiments,
  resolveCurrentStrategicHypotheses,
} from '../../packages/intelligence/src';
import {
  currentRecommendedExperimentsProjectionSchema,
  type CurrentStrategicHypothesesProjection,
  type RecommendedExperiment,
} from '../../packages/schemas/src';
import {
  BRAND_ID,
  COMPETITOR_ID,
  GENERATED_AT,
  uuid,
  signal,
  shipping,
  qualifyingSignals,
  hypotheses,
  experiments,
} from './fixtures/current-experiments';

const empty = (): CurrentStrategicHypothesesProjection => ({
  hypothesisEngineVersion: 'strategic-hypotheses-v1',
  hypotheses: [],
  unresolved: [],
  generationNeeded: [],
});
function resolve(
  current = hypotheses([shipping()]),
  history = experiments([shipping()]),
  signals = [shipping()],
) {
  return resolveCurrentRecommendedExperiments({
    currentHypotheses: { ...empty(), hypotheses: current },
    historicalExperiments: history,
    supportingSignals: signals,
    generatedAt: GENERATED_AT,
  });
}
function unknownProjection(signals = [shipping()]): CurrentStrategicHypothesesProjection {
  return resolveCurrentStrategicHypotheses({
    currentSignals: [],
    historicalSignals: signals,
    historicalHypotheses: hypotheses(signals),
    currentSignalUnresolved: signals.map((value) => ({
      logicalIdentity: currentCompetitiveSignalLogicalIdentity(value)!,
      state: 'unknown',
    })),
    generatedAt: GENERATED_AT,
  });
}

describe('current recommended experiment projection', () => {
  it.each(qualifyingSignals)(
    'returns the exact eligible persisted experiment for $comparisonKey',
    (value) => {
      const current = hypotheses([value]);
      const history = experiments([value], current);
      expect(resolve(current, history, [value])).toEqual({
        experimentEngineVersion: 'recommended-experiments-v1',
        experiments: history,
        unresolved: [],
        generationNeeded: [],
      });
      if (value.comparisonKey.startsWith('policy.'))
        expect(history[0]!.treatment).toMatchObject({ operationalReviewRequired: true });
    },
  );

  it('never substitutes conceptual identity for new current hypothesis lineage', () => {
    const later = shipping(20);
    const current = hypotheses([later], 300);
    const result = resolve(current, experiments([shipping()]), [later]);
    expect(result.experiments).toEqual([]);
    expect(result.generationNeeded).toEqual([
      {
        logicalIdentity: {
          ownedBrandId: BRAND_ID,
          competitorId: COMPETITOR_ID,
          experimentType: 'free_shipping_threshold',
          hypothesisType: current[0]!.hypothesisType,
        },
        sourceHypothesisIds: [current[0]!.id],
        candidateExperimentHash: experiments([later], current)[0]!.experimentHash,
        experimentEngineVersion: 'recommended-experiments-v1',
      },
    ]);
  });

  it.each(['lineage', 'control', 'treatment', 'provenance', 'brand', 'competitor', 'hash'])(
    'rejects a history match with mismatched %s even when the stored hash claims a match',
    (field) => {
      const original = experiments([shipping()])[0]!;
      const stale = structuredClone(original);
      if (field === 'lineage') stale.sourceHypothesisIds = [uuid(999)];
      if (field === 'control' && stale.control.kind === 'current_free_shipping_threshold')
        stale.control.thresholdUsd = 80;
      if (
        field === 'treatment' &&
        stale.treatment.kind === 'configurable_lower_free_shipping_threshold'
      )
        stale.treatment.competitorReferenceThresholdUsd = 45;
      if (field === 'provenance') stale.generationProvenance.eligibilityRuleId = 'different-rule';
      if (field === 'brand') stale.ownedBrandId = uuid(998);
      if (field === 'competitor') stale.competitorId = uuid(998);
      if (field === 'hash') stale.experimentHash = `sha256:${'f'.repeat(64)}`;
      expect(resolve(undefined, [stale])).toMatchObject({
        experiments: [],
        generationNeeded: [{ sourceHypothesisIds: original.sourceHypothesisIds }],
      });
    },
  );

  it('handles equality, reversal, and reappearance without altering either historical generation', () => {
    const first = shipping();
    const firstHypotheses = hypotheses([first]);
    const old = experiments([first], firstHypotheses);
    expect(resolve(firstHypotheses, old).experiments).toEqual(old);
    for (const currentSignals of [
      [],
      [
        signal('competitor_higher_free_shipping_threshold', 30, 'offer.free_shipping_threshold', {
          owned: 75,
          competitor: 100,
          delta: 25,
          unit: 'usd',
        }),
      ],
    ]) {
      const projection = resolveCurrentStrategicHypotheses({
        currentSignals,
        currentSignalUnresolved: [],
        historicalSignals: [first, ...currentSignals],
        historicalHypotheses: firstHypotheses,
        generatedAt: GENERATED_AT,
      });
      expect(
        resolveCurrentRecommendedExperiments({
          currentHypotheses: projection,
          supportingSignals: [],
          historicalExperiments: old,
          generatedAt: GENERATED_AT,
        }),
      ).toMatchObject({ experiments: [], unresolved: [], generationNeeded: [] });
    }
    const later = shipping(31);
    const renewed = hypotheses([later], 300);
    expect(resolve(renewed, old, [later])).toMatchObject({
      experiments: [],
      generationNeeded: [{ sourceHypothesisIds: [renewed[0]!.id] }],
    });
    const newer = experiments([later], renewed, 400);
    const history = [...old, ...newer];
    const before = structuredClone(history);
    expect(resolve(renewed, history, [later]).experiments).toEqual(newer);
    expect(history).toEqual(before);
    expect(history).toHaveLength(2);
  });

  it.each(qualifyingSignals)(
    'propagates unresolved $comparisonKey with or without an old experiment',
    (value) => {
      const currentHypotheses = unknownProjection([value]);
      for (const historicalExperiments of [[], experiments([value])]) {
        const result = resolveCurrentRecommendedExperiments({
          currentHypotheses,
          supportingSignals: [],
          historicalExperiments,
          generatedAt: GENERATED_AT,
        });
        expect(result.experiments).toEqual([]);
        expect(result.generationNeeded).toEqual([]);
        expect(result.unresolved).toEqual([
          {
            logicalIdentity: {
              ...currentHypotheses.unresolved[0]!.logicalIdentity,
              experimentType: experiments([value])[0]!.experimentType,
            },
            state: 'unknown',
            reason: 'hypothesis_unresolved',
            unresolvedHypothesisDependency: currentHypotheses.unresolved[0],
          },
        ]);
        expect(resolve([], historicalExperiments, []).unresolved).toEqual([]);
      }
    },
  );

  it('deduplicates explicit-discount uncertainty and preserves the original dependency metadata', () => {
    const currentHypotheses = unknownProjection([qualifyingSignals[5]!, qualifyingSignals[8]!]);
    const result = resolveCurrentRecommendedExperiments({
      currentHypotheses,
      supportingSignals: [],
      historicalExperiments: [],
      generatedAt: GENERATED_AT,
    });
    expect(result.unresolved).toHaveLength(1);
    expect(
      result.unresolved[0]!.unresolvedHypothesisDependency.unresolvedSignalDependencies,
    ).toHaveLength(2);
  });

  it('excludes aggregates, generic promotions, and hypothesis generation-needed from every experiment outcome', () => {
    const aggregate = hypotheses(qualifyingSignals).filter(({ hypothesisType }) =>
      hypothesisType.includes('combine'),
    );
    expect(aggregate).toHaveLength(1);
    expect(resolve(aggregate, [], []).generationNeeded).toEqual([]);
    const generic = signal(
      'competitor_offers_promotion_owned_does_not',
      40,
      'offer.promotion:save-today',
      { owned: false, competitor: true },
    );
    expect(resolve(hypotheses([generic]), [], [generic])).toMatchObject({
      experiments: [],
      generationNeeded: [],
    });
    const currentHypotheses = unknownProjection([generic]);
    currentHypotheses.unresolved.push(
      ...unknownProjection(qualifyingSignals).unresolved.filter(({ logicalIdentity }) =>
        logicalIdentity.hypothesisType.includes('combine'),
      ),
    );
    expect(
      resolveCurrentRecommendedExperiments({
        currentHypotheses,
        supportingSignals: [],
        historicalExperiments: [],
        generatedAt: GENERATED_AT,
      }).unresolved,
    ).toEqual([]);
    const pending = resolveCurrentStrategicHypotheses({
      currentSignals: [shipping()],
      currentSignalUnresolved: [],
      historicalHypotheses: [],
      historicalSignals: [shipping()],
      generatedAt: GENERATED_AT,
    });
    expect(pending.generationNeeded).toHaveLength(1);
    expect(
      resolveCurrentRecommendedExperiments({
        currentHypotheses: pending,
        supportingSignals: [shipping()],
        historicalExperiments: experiments([shipping()]),
        generatedAt: GENERATED_AT,
      }),
    ).toMatchObject({ experiments: [], generationNeeded: [], unresolved: [] });
  });

  it('uses only the supported version, including when an unsupported version claims the same hash', () => {
    const supported = experiments([shipping()])[0]!;
    const history = ['recommended-experiments-v0', 'recommended-experiments-v2'].map(
      (experimentEngineVersion, index) => ({
        ...supported,
        id: uuid(500 + index),
        experimentEngineVersion,
      }),
    );
    expect(resolve(undefined, history)).toMatchObject({ experiments: [], generationNeeded: [{}] });
    expect(resolve(undefined, [...history, supported]).experiments).toEqual([supported]);
    expect(history.map(({ experimentEngineVersion }) => experimentEngineVersion)).toEqual([
      'recommended-experiments-v0',
      'recommended-experiments-v2',
    ]);
  });

  it('is stable across ordering and timestamps and retains exact signal/evidence provenance', () => {
    const current = hypotheses(qualifyingSignals);
    const history = experiments(qualifyingSignals, current);
    const first = resolve(current, history, qualifyingSignals);
    const second = resolveCurrentRecommendedExperiments({
      currentHypotheses: { ...empty(), hypotheses: [...current].reverse() },
      supportingSignals: [...qualifyingSignals].reverse(),
      historicalExperiments: [...history].reverse(),
      generatedAt: '2026-09-05T12:00:00.000Z',
    });
    expect(second).toEqual(first);
    expect(resolve(current, [], qualifyingSignals)).toEqual(
      resolve([...current].reverse(), [], [...qualifyingSignals].reverse()),
    );
    for (const experiment of first.experiments) {
      const hypothesis = current.find(({ id }) => id === experiment.sourceHypothesisIds[0])!;
      expect(hypothesis).toBeDefined();
      for (const id of hypothesis.supportingSignalIds)
        expect(qualifyingSignals.find((value) => value.id === id)!.evidence[0]!.observationId).toBe(
          uuid(902),
        );
    }
  });

  it('rejects incomplete/mismatched lineage and malformed shared contracts', () => {
    expect(() => resolve(undefined, [], [])).toThrow('every linked supporting signal');
    expect(() => resolve(undefined, [], [{ ...shipping(), competitorId: uuid(999) }])).toThrow(
      'mismatched hypothesis lineage',
    );
    const current = unknownProjection();
    current.unresolved[0]!.unresolvedSignalDependencies[0]!.competitorId = uuid(999);
    expect(() =>
      resolveCurrentRecommendedExperiments({
        currentHypotheses: current,
        supportingSignals: [],
        historicalExperiments: [],
        generatedAt: GENERATED_AT,
      }),
    ).toThrow('mismatched experiment scope');
    const result = resolve();
    expect(() =>
      currentRecommendedExperimentsProjectionSchema.parse({ ...result, ranking: [] }),
    ).toThrow();
    expect(() =>
      currentRecommendedExperimentsProjectionSchema.parse({
        ...result,
        experiments: [
          { ...result.experiments[0], experimentEngineVersion: 'recommended-experiments-v0' },
        ],
      }),
    ).toThrow();
    expect(() =>
      resolve(undefined, [
        { ...result.experiments[0], active: true } as unknown as RecommendedExperiment,
      ]),
    ).toThrow();
  });
});
