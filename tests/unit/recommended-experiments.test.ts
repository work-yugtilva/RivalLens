import { describe, expect, it } from 'vitest';
import {
  RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
  generateRecommendedExperiments,
  generateStrategicHypotheses,
} from '../../packages/intelligence/src';
import {
  recommendedExperimentCandidateSchema,
  recommendedExperimentSchema,
  strategicHypothesisSchema,
  type CompetitiveSignal,
  type CompetitiveSignalSupportingValues,
  type CompetitiveSignalType,
  type StrategicHypothesis,
} from '../../packages/schemas/src';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function signal(
  signalType: CompetitiveSignalType,
  index: number,
  comparisonKey: string,
  supportingValues: CompetitiveSignalSupportingValues,
): CompetitiveSignal {
  return {
    id: uuid(index),
    signalType,
    ownedBrandId: BRAND_ID,
    competitorId: COMPETITOR_ID,
    comparisonKey,
    statement: `Observed ${signalType}.`,
    supportingValues,
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

function persistedHypotheses(signals: CompetitiveSignal[]): StrategicHypothesis[] {
  return generateStrategicHypotheses({ currentSignals: signals, generatedAt: GENERATED_AT }).map(
    (candidate, index) => strategicHypothesisSchema.parse({ id: uuid(100 + index), ...candidate }),
  );
}

function experiments(
  signals: CompetitiveSignal[],
  hypotheses = persistedHypotheses(signals),
  generatedAt = GENERATED_AT,
) {
  return generateRecommendedExperiments({
    currentHypotheses: hypotheses,
    supportingSignals: signals,
    generatedAt,
  });
}

describe('recommended experiment taxonomy and configuration', () => {
  it('turns a supported shipping hypothesis into a reference-safe threshold test', () => {
    const shipping = signal(
      'competitor_lower_free_shipping_threshold',
      1,
      'offer.free_shipping_threshold',
      {
        owned: 75,
        competitor: 50,
        delta: -25,
        unit: 'usd',
      },
    );
    const [experiment] = experiments([shipping]);

    expect(experiment).toMatchObject({
      experimentType: 'free_shipping_threshold',
      control: { kind: 'current_free_shipping_threshold', thresholdUsd: 75 },
      treatment: {
        kind: 'configurable_lower_free_shipping_threshold',
        thresholdUsd: { status: 'requires_user_configuration' },
        competitorReferenceThresholdUsd: 50,
      },
      primaryMetric: {
        metric: 'checkout_conversion_rate',
        measurementReadiness: 'requires_first_party_data',
      },
      confidence: { level: 'medium', basis: 'support_for_testing_rationale' },
      caveat: { category: 'shipping_margin_exposure' },
    });
    expect(experiment?.guardrailMetrics.map(({ metric }) => metric)).toEqual([
      'contribution_margin_per_order',
      'shipping_cost_per_order',
      'average_order_value',
    ]);
    expect(experiment?.treatment).not.toHaveProperty('thresholdUsd', 50);
  });

  it('decomposes supported return and guarantee evidence into separate policy tests', () => {
    const returns = signal('competitor_longer_return_window', 2, 'policy.return_window', {
      owned: 30,
      competitor: 60,
      delta: 30,
      unit: 'days',
    });
    const guarantee = signal(
      'competitor_longer_guarantee_duration',
      3,
      'policy.guarantee_duration',
      {
        owned: 30,
        competitor: 90,
        delta: 60,
        unit: 'days',
      },
    );
    const generated = experiments([returns, guarantee]);

    expect(generated.map(({ experimentType }) => experimentType)).toEqual([
      'guarantee_policy',
      'return_window_policy',
    ]);
    for (const experiment of generated) {
      expect(experiment.treatment).toMatchObject({ operationalReviewRequired: true });
      expect(experiment.guardrailMetrics.map(({ metric }) => metric)).toEqual([
        'return_rate',
        'refund_rate',
        'contribution_margin_per_order',
      ]);
      expect(experiment.caveat.category).toBe('policy_return_refund_exposure');
    }
  });

  it('supports subscription availability without inventing terms', () => {
    const availability = signal(
      'competitor_offers_subscription_owned_does_not',
      4,
      'subscription.available',
      {
        owned: false,
        competitor: true,
      },
    );
    const [experiment] = experiments([availability]);
    expect(experiment).toMatchObject({
      experimentType: 'subscription_availability',
      control: { kind: 'current_one_time_purchase_only' },
      treatment: {
        kind: 'visible_subscribe_and_save_option',
        discountPercent: { status: 'requires_user_configuration' },
      },
      primaryMetric: { metric: 'subscription_take_rate' },
    });
    expect(experiment?.guardrailMetrics.map(({ metric }) => metric)).toContain(
      'subscription_cancellation_rate',
    );
  });

  it('supports a subscription discount while preserving the owned baseline', () => {
    const discount = signal('competitor_higher_subscription_discount', 5, 'subscription.discount', {
      owned: 10,
      competitor: 15,
      delta: 5,
      unit: 'percentage_points',
    });
    const [experiment] = experiments([discount]);
    expect(experiment).toMatchObject({
      experimentType: 'subscription_discount',
      control: { discountPercent: 10 },
      treatment: {
        discountPercent: { status: 'requires_user_configuration' },
        competitorReferenceDiscountPercent: 15,
      },
    });
  });

  it('selects explicit discount, bundle, and BOGO as distinct experiment families', () => {
    const explicit = signal(
      'competitor_offers_explicit_discount_owned_does_not',
      6,
      'offer.discount:fixed:12',
      {
        owned: false,
        competitor: true,
      },
    );
    const bundle = signal('competitor_offers_bundle_owned_does_not', 7, 'offer.bundle', {
      owned: false,
      competitor: true,
    });
    const bogo = signal('competitor_offers_bogo_owned_does_not', 8, 'offer.buy_x_get_y', {
      owned: false,
      competitor: true,
    });
    const generated = experiments([explicit, bundle, bogo]);
    expect(generated.map(({ experimentType }) => experimentType)).toEqual([
      'bogo_offer',
      'bundle_offer',
      'explicit_discount',
    ]);
    expect(
      generated.find(({ experimentType }) => experimentType === 'explicit_discount'),
    ).toMatchObject({
      treatment: { discountKind: 'fixed', competitorReferenceAmount: 12 },
    });
    for (const experiment of generated) {
      expect(experiment.guardrailMetrics[0]?.metric).toBe('contribution_margin_per_order');
    }
  });

  it('prefers a numeric discount comparison over a presence-only signal for the same family', () => {
    const presence = signal(
      'competitor_offers_explicit_discount_owned_does_not',
      9,
      'offer.discount:percentage:20',
      {
        owned: false,
        competitor: true,
      },
    );
    const numeric = signal(
      'competitor_higher_explicit_percentage_discount',
      10,
      'offer.discount.explicit_percentage',
      {
        owned: 10,
        competitor: 20,
        delta: 10,
        unit: 'percentage_points',
      },
    );
    const [experiment] = experiments([presence, numeric]);
    expect(experiment).toMatchObject({
      experimentType: 'explicit_discount',
      control: { observedAmount: 10 },
      treatment: { constraint: 'higher_than_control', competitorReferenceAmount: 20 },
    });
  });
});

describe('recommended experiment eligibility, language, confidence, and identity', () => {
  it('skips generic promotion evidence and the aggregate hypothesis', () => {
    const generic = signal('competitor_offers_promotion_owned_does_not', 11, 'offer.promo:SAVE', {
      owned: false,
      competitor: true,
    });
    expect(experiments([generic])).toEqual([]);

    const inputs = [
      signal('competitor_lower_free_shipping_threshold', 12, 'offer.free_shipping_threshold', {
        owned: 75,
        competitor: 50,
        delta: -25,
        unit: 'usd',
      }),
      signal('competitor_longer_return_window', 13, 'policy.return_window', {
        owned: 30,
        competitor: 60,
        delta: 30,
        unit: 'days',
      }),
      signal('competitor_offers_subscription_owned_does_not', 14, 'subscription.available', {
        owned: false,
        competitor: true,
      }),
    ];
    const aggregate = persistedHypotheses(inputs).filter(({ hypothesisType }) =>
      hypothesisType.includes('combine'),
    );
    expect(aggregate).toHaveLength(1);
    expect(experiments(inputs, aggregate)).toEqual([]);
  });

  it('rejects incomplete lineage and skips incompatible evidence', () => {
    const shipping = signal(
      'competitor_lower_free_shipping_threshold',
      15,
      'offer.free_shipping_threshold',
      { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
    );
    const hypotheses = persistedHypotheses([shipping]);
    expect(() => experiments([], hypotheses)).toThrow('every linked supporting signal');
    expect(
      experiments(
        [{ ...shipping, supportingValues: { owned: 75, competitor: 100, delta: 25, unit: 'usd' } }],
        hypotheses,
      ),
    ).toEqual([]);
  });

  it('models worth-testing confidence only and emits no unsupported claims or duration', () => {
    const shipping = signal(
      'competitor_lower_free_shipping_threshold',
      16,
      'offer.free_shipping_threshold',
      { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
    );
    const [experiment] = experiments([shipping]);
    const serialized = JSON.stringify(experiment);
    expect(serialized).not.toMatch(
      /winProbability|expectedUplift|sampleSize|durationDays|revenue increase|ROAS improvement|will improve/i,
    );
    expect(experiment?.durationPlanning.status).toBe('requires_first_party_data');
    expect(experiment?.confidence.level).toBe('medium');
  });

  it('keeps identity stable across time and changes it for new hypothesis lineage', () => {
    const firstSignal = signal(
      'competitor_lower_free_shipping_threshold',
      17,
      'offer.free_shipping_threshold',
      { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
    );
    const hypothesis = persistedHypotheses([firstSignal]);
    const first = experiments([firstSignal], hypothesis, GENERATED_AT)[0]!;
    const replay = experiments([firstSignal], hypothesis, '2026-09-05T12:00:00.000Z')[0]!;
    expect(first.experimentHash).toBe(replay.experimentHash);
    expect(first.generatedAt).not.toBe(replay.generatedAt);
    expect(first.experimentEngineVersion).toBe(RECOMMENDED_EXPERIMENT_ENGINE_VERSION);

    const laterHypothesis = hypothesis.map((value) => ({ ...value, id: uuid(999) }));
    expect(experiments([firstSignal], laterHypothesis)[0]?.experimentHash).not.toBe(
      first.experimentHash,
    );
  });

  it('strictly separates candidates from persisted experiments and rejects noncanonical fields', () => {
    const shipping = signal(
      'competitor_lower_free_shipping_threshold',
      18,
      'offer.free_shipping_threshold',
      { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
    );
    const candidate = experiments([shipping])[0]!;
    expect(recommendedExperimentCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(recommendedExperimentSchema.parse({ id: uuid(700), ...candidate })).toMatchObject({
      id: uuid(700),
    });
    expect(() =>
      recommendedExperimentCandidateSchema.parse({ ...candidate, expectedUplift: 0.1 }),
    ).toThrow();
    expect(() =>
      recommendedExperimentCandidateSchema.parse({
        ...candidate,
        title: 'Lower it because conversion will improve.',
      }),
    ).toThrow();
    expect(() =>
      recommendedExperimentCandidateSchema.parse({
        ...candidate,
        sourceHypothesisIds: [candidate.sourceHypothesisIds[0], candidate.sourceHypothesisIds[0]],
      }),
    ).toThrow();
    expect(() =>
      recommendedExperimentCandidateSchema.parse({
        ...candidate,
        guardrailMetrics: [candidate.primaryMetric],
      }),
    ).toThrow();
  });
});
