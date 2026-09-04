import { describe, expect, it } from 'vitest';
import {
  currentCompetitiveSignalLogicalIdentity,
  generateStrategicHypotheses,
  resolveCurrentStrategicHypotheses,
} from '../../packages/intelligence/src';
import {
  currentStrategicHypothesesProjectionSchema,
  strategicHypothesisSchema,
  type CompetitiveSignal,
  type CompetitiveSignalType,
  type StrategicHypothesis,
} from '../../packages/schemas/src';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function signal(signalType: CompetitiveSignalType, index: number): CompetitiveSignal {
  return {
    id: uuid(index),
    signalType,
    ownedBrandId: BRAND_ID,
    competitorId: COMPETITOR_ID,
    comparisonKey: `comparison.${signalType}`,
    statement: `Observed ${signalType}.`,
    supportingValues: { competitor: true },
    confidence: 'high',
    evidence: [
      {
        role: 'competitor',
        sourceId: uuid(900),
        snapshotId: uuid(901),
        observationId: uuid(902),
        confidence: 0.95,
      },
    ],
    generatedAt: GENERATED_AT,
    ruleVersion: 'competitive-signals-v1',
    signalHash: `sha256:${index.toString(16).padStart(64, '0')}`,
  };
}

function historical(candidate: ReturnType<typeof generateStrategicHypotheses>[number], index: number) {
  return strategicHypothesisSchema.parse({ id: uuid(index), ...candidate });
}

function resolve(input: {
  currentSignals: CompetitiveSignal[];
  historicalHypotheses: StrategicHypothesis[];
  historicalSignals: CompetitiveSignal[];
  unresolved?: Array<{ logicalIdentity: NonNullable<ReturnType<typeof currentCompetitiveSignalLogicalIdentity>>; state: 'unknown' }>;
}) {
  return resolveCurrentStrategicHypotheses({
    ...input,
    currentSignalUnresolved: input.unresolved ?? [],
    generatedAt: GENERATED_AT,
  });
}

function unknown(signal: CompetitiveSignal) {
  return {
    logicalIdentity: currentCompetitiveSignalLogicalIdentity(signal)!,
    state: 'unknown' as const,
  };
}

describe('current strategic hypothesis projection', () => {
  it('returns an exactly matched persisted shipping hypothesis while the lower threshold is current', () => {
    const shipping = signal('competitor_lower_free_shipping_threshold', 1);
    const candidate = generateStrategicHypotheses({ currentSignals: [shipping], generatedAt: GENERATED_AT })[0]!;
    const persisted = historical(candidate, 100);

    const projection = resolve({ currentSignals: [shipping], historicalHypotheses: [persisted], historicalSignals: [shipping] });
    expect(projection).toMatchObject({
      hypotheses: [{ id: persisted.id, supportingSignalIds: [shipping.id] }],
      unresolved: [],
      generationNeeded: [],
    });
    expect(() => currentStrategicHypothesesProjectionSchema.parse({ ...projection, recommendation: {} })).toThrow();
  });

  it('removes a shipping hypothesis for equality or reverse-direction current evidence', () => {
    const lower = signal('competitor_lower_free_shipping_threshold', 2);
    const persisted = historical(
      generateStrategicHypotheses({ currentSignals: [lower], generatedAt: GENERATED_AT })[0]!,
      101,
    );

    for (const current of [
      [] as CompetitiveSignal[],
      [signal('competitor_higher_free_shipping_threshold', 3)],
    ]) {
      expect(resolve({ currentSignals: current, historicalHypotheses: [persisted], historicalSignals: [lower] })).toMatchObject({
        hypotheses: [],
        unresolved: [],
        generationNeeded: [],
      });
    }
  });

  it('marks renewed evidence generation-needed until its exact new lineage is persisted', () => {
    const earlier = signal('competitor_lower_free_shipping_threshold', 4);
    const earlierHypothesis = historical(
      generateStrategicHypotheses({ currentSignals: [earlier], generatedAt: GENERATED_AT })[0]!,
      102,
    );
    const later = signal('competitor_lower_free_shipping_threshold', 5);
    const laterCandidate = generateStrategicHypotheses({ currentSignals: [later], generatedAt: GENERATED_AT })[0]!;

    expect(resolve({ currentSignals: [later], historicalHypotheses: [earlierHypothesis], historicalSignals: [earlier, later] })).toMatchObject({
      hypotheses: [],
      generationNeeded: [{ supportingSignalIds: [later.id], candidateHypothesisHash: laterCandidate.hypothesisHash }],
    });

    const laterHypothesis = historical(laterCandidate, 103);
    expect(resolve({ currentSignals: [later], historicalHypotheses: [earlierHypothesis, laterHypothesis], historicalSignals: [earlier, later] }).hypotheses).toEqual([laterHypothesis]);
  });

  it('returns unknown shipping and subscription dependencies rather than stale historical hypotheses', () => {
    const shipping = signal('competitor_lower_free_shipping_threshold', 6);
    const subscription = signal('competitor_offers_subscription_owned_does_not', 7);
    const hypotheses = generateStrategicHypotheses({ currentSignals: [shipping, subscription], generatedAt: GENERATED_AT });
    const shippingHypothesis = historical(hypotheses.find((value) => value.hypothesisType.includes('shipping'))!, 104);
    const subscriptionHypothesis = historical(hypotheses.find((value) => value.hypothesisType.includes('repeat'))!, 105);

    expect(resolve({
      currentSignals: [],
      historicalHypotheses: [shippingHypothesis, subscriptionHypothesis],
      historicalSignals: [shipping, subscription],
      unresolved: [unknown(shipping), unknown(subscription)],
    })).toMatchObject({
      hypotheses: [],
      unresolved: [
        { logicalIdentity: { hypothesisType: 'competitor_may_emphasize_repeat_purchase_mechanics' } },
        { logicalIdentity: { hypothesisType: 'competitor_may_reduce_shipping_friction' } },
      ],
    });
  });

  it('removes the repeat-purchase hypothesis when both brands have subscriptions', () => {
    const subscription = signal('competitor_offers_subscription_owned_does_not', 71);
    const persisted = historical(
      generateStrategicHypotheses({ currentSignals: [subscription], generatedAt: GENERATED_AT })[0]!,
      106,
    );

    expect(resolve({
      currentSignals: [],
      historicalHypotheses: [persisted],
      historicalSignals: [subscription],
    })).toMatchObject({ hypotheses: [], unresolved: [], generationNeeded: [] });
  });

  it('keeps policy and promotional families current only while their qualifying signals are current', () => {
    const policy = signal('competitor_longer_return_window', 8);
    const promotion = signal('competitor_offers_bundle_owned_does_not', 9);
    const candidates = generateStrategicHypotheses({ currentSignals: [policy, promotion], generatedAt: GENERATED_AT });
    const history = candidates.map((candidate, index) => historical(candidate, 110 + index));

    expect(resolve({ currentSignals: [policy, promotion], historicalHypotheses: history, historicalSignals: [policy, promotion] }).hypotheses).toHaveLength(2);
    expect(resolve({ currentSignals: [], historicalHypotheses: history, historicalSignals: [policy, promotion] }).hypotheses).toEqual([]);
  });

  it('requires every aggregate dependency, distinguishes removal from unknown, and ignores unrelated signals', () => {
    const shipping = signal('competitor_lower_free_shipping_threshold', 10);
    const policy = signal('competitor_longer_guarantee_duration', 11);
    const repeat = signal('competitor_higher_subscription_discount', 12);
    const promotion = signal('competitor_offers_bogo_owned_does_not', 13);
    const aggregateCandidate = generateStrategicHypotheses({ currentSignals: [shipping, policy, repeat], generatedAt: GENERATED_AT }).find(
      (candidate) => candidate.hypothesisType.includes('combine'),
    )!;
    const aggregate = historical(aggregateCandidate, 120);

    expect(resolve({ currentSignals: [shipping, policy, repeat], historicalHypotheses: [aggregate], historicalSignals: [shipping, policy, repeat] }).hypotheses).toEqual([aggregate]);
    expect(resolve({ currentSignals: [shipping, policy, promotion], historicalHypotheses: [aggregate], historicalSignals: [shipping, policy, repeat, promotion] })).toMatchObject({ hypotheses: [], unresolved: [] });
    expect(resolve({
      currentSignals: [shipping, policy],
      historicalHypotheses: [aggregate],
      historicalSignals: [shipping, policy, repeat],
      unresolved: [unknown(repeat)],
    })).toMatchObject({
      hypotheses: [],
      unresolved: [{
        logicalIdentity: { hypothesisType: 'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives' },
        unresolvedSignalDependencies: [unknown(repeat).logicalIdentity],
      }],
    });
  });

  it('keeps older engine outputs historical-only', () => {
    const shipping = signal('competitor_lower_free_shipping_threshold', 14);
    const candidate = generateStrategicHypotheses({ currentSignals: [shipping], generatedAt: GENERATED_AT })[0]!;
    const older = strategicHypothesisSchema.parse({
      id: uuid(130),
      ...candidate,
      hypothesisEngineVersion: 'strategic-hypotheses-v0',
    });

    expect(resolve({ currentSignals: [shipping], historicalHypotheses: [older], historicalSignals: [shipping] })).toMatchObject({
      hypotheses: [],
      generationNeeded: [{ candidateHypothesisHash: candidate.hypothesisHash }],
    });
  });
});
