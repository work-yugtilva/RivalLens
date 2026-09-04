import { describe, expect, it } from 'vitest';
import {
  STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
  generateStrategicHypotheses,
} from '../../packages/intelligence/src';
import {
  strategicHypothesisCandidateSchema,
  strategicHypothesisSchema,
  type CompetitiveSignal,
  type CompetitiveSignalConfidence,
  type CompetitiveSignalType,
} from '../../packages/schemas/src';

const OWNED_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_COMPETITOR_ID = '33333333-3333-4333-8333-333333333333';
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function signal(
  signalType: CompetitiveSignalType,
  index: number,
  options: {
    confidence?: CompetitiveSignalConfidence;
    competitorId?: string;
    ruleVersion?: string;
  } = {},
): CompetitiveSignal {
  return {
    id: uuid(index),
    signalType,
    ownedBrandId: OWNED_ID,
    competitorId: options.competitorId ?? COMPETITOR_ID,
    comparisonKey: `comparison.${signalType}`,
    statement: `Observed ${signalType}.`,
    supportingValues: { competitor: true },
    confidence: options.confidence ?? 'high',
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
    ruleVersion: options.ruleVersion ?? 'competitive-signals-v1',
    signalHash: `sha256:${index.toString(16).padStart(64, '0')}`,
  };
}

function generate(currentSignals: CompetitiveSignal[], generatedAt = GENERATED_AT) {
  return generateStrategicHypotheses({ currentSignals, generatedAt });
}

describe('generateStrategicHypotheses eligibility', () => {
  it('turns only a lower competitor shipping threshold into a conservative friction hypothesis', () => {
    const lower = signal('competitor_lower_free_shipping_threshold', 1);
    const hypotheses = generate([lower]);

    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0]).toMatchObject({
      hypothesisType: 'competitor_may_reduce_shipping_friction',
      supportingSignalIds: [lower.id],
      statement:
        'The competitor may be using a lower free-shipping threshold to reduce purchase friction.',
      confidence: 'medium',
      uncertainty: {
        category: 'conversion_effect_not_established',
        statement: 'Public evidence does not establish whether this improves conversion.',
      },
    });

    expect(generate([signal('competitor_higher_free_shipping_threshold', 2)])).toEqual([]);
  });

  it.each([
    'competitor_longer_return_window',
    'competitor_longer_guarantee_duration',
  ] as const)('supports perceived-risk interpretation for %s', (signalType) => {
    expect(generate([signal(signalType, 3)])[0]).toMatchObject({
      hypothesisType: 'competitor_may_reduce_perceived_purchase_risk',
      uncertainty: { category: 'conversion_effect_not_established' },
    });
  });

  it('combines compatible longer-policy signals into one hypothesis', () => {
    const returnWindow = signal('competitor_longer_return_window', 4);
    const guarantee = signal('competitor_longer_guarantee_duration', 5);

    expect(generate([guarantee, returnWindow])).toMatchObject([
      {
        hypothesisType: 'competitor_may_reduce_perceived_purchase_risk',
        supportingSignalIds: [returnWindow.id, guarantee.id],
      },
    ]);
  });

  it.each([
    'competitor_offers_subscription_owned_does_not',
    'competitor_higher_subscription_discount',
  ] as const)('supports repeat-purchase interpretation for %s', (signalType) => {
    expect(generate([signal(signalType, 6)])[0]).toMatchObject({
      hypothesisType: 'competitor_may_emphasize_repeat_purchase_mechanics',
      uncertainty: { category: 'retention_effect_not_established' },
    });
  });

  it.each([
    'competitor_offers_explicit_discount_owned_does_not',
    'competitor_offers_promotion_owned_does_not',
    'competitor_offers_bundle_owned_does_not',
    'competitor_offers_bogo_owned_does_not',
    'competitor_higher_explicit_percentage_discount',
  ] as const)('supports conservative promotional interpretation for %s', (signalType) => {
    const hypothesis = generate([signal(signalType, 7)])[0];
    expect(hypothesis).toMatchObject({
      hypothesisType: 'competitor_may_emphasize_promotional_incentives',
      uncertainty: {
        category: 'promotion_impact_not_established',
        statement: 'This indicates a promotional difference, not its business impact.',
      },
    });
    expect(`${hypothesis?.statement} ${hypothesis?.rationale}`).not.toMatch(
      /revenue|roas|conversion|spend|traffic|customer acquisition|outperform|causes?/i,
    );
  });

  it('skips equal, unknown, reverse, historical-only, unsupported-version, and positioning inputs', () => {
    expect(generate([])).toEqual([]);
    expect(
      generate([
        signal('competitor_shorter_return_window', 8),
        signal('owned_offers_subscription_competitor_does_not', 9),
        signal('competitor_lower_explicit_percentage_discount', 10),
        signal('competitor_lowered_free_shipping_threshold', 11),
        signal('positioning_differs', 12),
        signal('competitor_lower_free_shipping_threshold', 13, {
          ruleVersion: 'competitive-signals-v0',
        }),
      ]),
    ).toEqual([]);
  });

  it('creates only the explicit same-competitor three-family aggregate and retains every signal ID', () => {
    const shipping = signal('competitor_lower_free_shipping_threshold', 14);
    const policy = signal('competitor_longer_return_window', 15);
    const subscription = signal('competitor_offers_subscription_owned_does_not', 16);
    const subscriptionDiscount = signal('competitor_higher_subscription_discount', 17);
    const promotion = signal('competitor_offers_bundle_owned_does_not', 18);
    const hypotheses = generate([
      promotion,
      subscriptionDiscount,
      policy,
      shipping,
      subscription,
    ]);
    const aggregate = hypotheses.find(
      ({ hypothesisType }) =>
        hypothesisType ===
        'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives',
    );

    expect(aggregate).toMatchObject({
      supportingSignalIds: [shipping.id, policy.id, subscription.id, subscriptionDiscount.id],
      uncertainty: { category: 'combined_business_impact_not_established' },
    });
    expect(aggregate?.supportingSignalIds).not.toContain(promotion.id);
    expect(hypotheses.filter(({ hypothesisType }) => hypothesisType.includes('combine'))).toHaveLength(
      1,
    );
  });

  it('does not synthesize an aggregate from unrelated or cross-competitor signals', () => {
    expect(
      generate([
        signal('competitor_lower_free_shipping_threshold', 19),
        signal('competitor_longer_return_window', 20),
        signal('competitor_offers_bundle_owned_does_not', 21),
      ]).some(({ hypothesisType }) => hypothesisType.includes('combine')),
    ).toBe(false);

    expect(
      generate([
        signal('competitor_lower_free_shipping_threshold', 22),
        signal('competitor_longer_return_window', 23),
        signal('competitor_offers_subscription_owned_does_not', 24, {
          competitorId: OTHER_COMPETITOR_ID,
        }),
      ]).some(({ hypothesisType }) => hypothesisType.includes('combine')),
    ).toBe(false);
  });
});

describe('generateStrategicHypotheses confidence, language, and identity', () => {
  it.each([
    ['high', 'medium'],
    ['medium', 'low'],
    ['low', 'low'],
  ] as const)('maps weakest %s signal confidence to %s', (signalConfidence, expected) => {
    expect(
      generate([
        signal('competitor_longer_return_window', 25, { confidence: 'high' }),
        signal('competitor_longer_guarantee_duration', 26, {
          confidence: signalConfidence,
        }),
      ])[0]?.confidence,
    ).toBe(expected);
  });

  it('never presents performance, causality, a recommendation, or an experiment', () => {
    const hypotheses = generate([
      signal('competitor_lower_free_shipping_threshold', 27),
      signal('competitor_longer_return_window', 28),
      signal('competitor_offers_subscription_owned_does_not', 29),
      signal('competitor_offers_bogo_owned_does_not', 30),
    ]);
    for (const hypothesis of hypotheses) {
      expect(hypothesis).not.toHaveProperty('recommendation');
      expect(hypothesis).not.toHaveProperty('experiment');
      expect(hypothesis).not.toHaveProperty('predictedRevenue');
      expect(hypothesis).not.toHaveProperty('predictedRoas');
      expect(`${hypothesis.statement} ${hypothesis.rationale}`).not.toMatch(
        /revenue|roas|conversion|spend|traffic|customer acquisition|outperform|causes?|proven/i,
      );
      expect(hypothesis.statement).toContain(' may ');
    }
  });

  it('keeps identity stable across generation time and input order', () => {
    const firstSignal = signal('competitor_longer_return_window', 31);
    const secondSignal = signal('competitor_longer_guarantee_duration', 32);
    const first = generate([firstSignal, secondSignal], GENERATED_AT)[0]!;
    const second = generate(
      [secondSignal, firstSignal],
      '2026-09-05T12:00:00.000Z',
    )[0]!;

    expect(first.hypothesisHash).toBe(second.hypothesisHash);
    expect(first.generatedAt).not.toBe(second.generatedAt);
    expect(first.supportingSignalIds).toEqual([firstSignal.id, secondSignal.id]);
    expect(first.hypothesisEngineVersion).toBe(STRATEGIC_HYPOTHESIS_ENGINE_VERSION);
  });

  it('changes identity for new signal evidence', () => {
    const first = generate([signal('competitor_lower_free_shipping_threshold', 33)])[0]!;
    const later = generate([signal('competitor_lower_free_shipping_threshold', 34)])[0]!;
    expect(first.hypothesisHash).not.toBe(later.hypothesisHash);
  });
});

describe('strategic hypothesis contracts', () => {
  it('strictly distinguishes candidate and persisted output', () => {
    const candidate = generate([signal('competitor_lower_free_shipping_threshold', 35)])[0]!;
    expect(strategicHypothesisCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(strategicHypothesisSchema.parse({ id: uuid(36), ...candidate })).toMatchObject({
      id: uuid(36),
      ...candidate,
    });
    expect(() => strategicHypothesisCandidateSchema.parse({ id: uuid(36), ...candidate })).toThrow();
  });

  it('rejects noncanonical interpretation, caveat, provenance, signal order, and forbidden fields', () => {
    const source = signal('competitor_longer_return_window', 37);
    const candidate = generate([source])[0]!;
    expect(() =>
      strategicHypothesisCandidateSchema.parse({ ...candidate, statement: 'This improves conversion.' }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({ ...candidate, rationale: 'Invented traffic data.' }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({
        ...candidate,
        uncertainty: { ...candidate.uncertainty, statement: 'No caveat.' },
      }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({
        ...candidate,
        generationProvenance: {
          ...candidate.generationProvenance,
          templateId: 'competitor_may_reduce_shipping_friction',
        },
      }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({
        ...candidate,
        supportingSignalIds: [uuid(99), uuid(98)],
      }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({
        ...candidate,
        supportingSignalIds: [source.id, source.id],
      }),
    ).toThrow();
    expect(() =>
      strategicHypothesisCandidateSchema.parse({ ...candidate, confidence: 'high' }),
    ).toThrow();
    for (const forbidden of [
      { recommendation: 'Copy the competitor' },
      { experiment: 'Run an A/B test' },
      { predictedRevenue: 1_000_000 },
      { predictedRoas: 4 },
      { inventedConversion: 0.25 },
      { inventedSpend: 10_000 },
      { inventedTraffic: 50_000 },
    ]) {
      expect(() => strategicHypothesisCandidateSchema.parse({ ...candidate, ...forbidden })).toThrow();
    }
  });
});
