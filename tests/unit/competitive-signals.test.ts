import { describe, expect, it } from 'vitest';
import type {
  BrandComparisonResult,
  ComparisonProvenance,
  ComparisonSubjectValue,
  ObservedChange,
} from '../../packages/schemas/src';
import {
  COMPETITIVE_SIGNAL_RULE_VERSION,
  detectCompetitiveSignals,
  type EvidenceEnrichedObservedChange,
} from '../../packages/intelligence/src';

const OWNED_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const OWNED_SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const COMPETITOR_SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const OWNED_SNAPSHOT_ID = '55555555-5555-4555-8555-555555555555';
const COMPETITOR_SNAPSHOT_ID = '66666666-6666-4666-8666-666666666666';
const OWNED_OBSERVATION_ID = '77777777-7777-4777-8777-777777777777';
const COMPETITOR_OBSERVATION_ID = '88888888-8888-4888-8888-888888888888';
const CHANGE_ID = '99999999-9999-4999-8999-999999999999';
const PREVIOUS_SNAPSHOT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PREVIOUS_OBSERVATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRIOR_EVALUATION_OBSERVATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const GENERATED_AT = '2026-09-03T12:00:00.000Z';

function provenance(subject: 'owned' | 'competitor', confidence = 0.95): ComparisonProvenance {
  return {
    observationId: subject === 'owned' ? OWNED_OBSERVATION_ID : COMPETITOR_OBSERVATION_ID,
    snapshotId: subject === 'owned' ? OWNED_SNAPSHOT_ID : COMPETITOR_SNAPSHOT_ID,
    sourceId: subject === 'owned' ? OWNED_SOURCE_ID : COMPETITOR_SOURCE_ID,
    sourceUrl: subject === 'owned' ? 'https://owned.test/' : 'https://rival.test/',
    observedAt: GENERATED_AT,
    confidence,
  };
}

function value(
  state: ComparisonSubjectValue['state'],
  data: Record<string, unknown> | null,
  subject: 'owned' | 'competitor',
  confidence = 0.95,
): ComparisonSubjectValue {
  return {
    state,
    value: data,
    provenance:
      state === 'unknown'
        ? null
        : {
            ...provenance(subject, confidence),
            observationId:
              state === 'explicitly_absent'
                ? null
                : subject === 'owned'
                  ? OWNED_OBSERVATION_ID
                  : COMPETITOR_OBSERVATION_ID,
          },
  };
}

function comparison(
  facts: BrandComparisonResult['facts'],
  competitors = [
    { subjectType: 'competitor' as const, subjectId: COMPETITOR_ID, domain: 'rival.test' },
  ],
): BrandComparisonResult {
  return {
    brandId: OWNED_ID,
    generatedAt: GENERATED_AT,
    ownedSubject: { subjectType: 'brand', subjectId: OWNED_ID, domain: 'owned.test' },
    competitors,
    facts,
    productsBySubject: {
      [OWNED_ID]: { productCount: 0, products: [] },
      [COMPETITOR_ID]: { productCount: 0, products: [] },
    },
  };
}

function numericFact(
  key: string,
  owned: number,
  competitor: number,
  unit: 'usd' | 'days' | 'percent',
  field: string,
  ownedConfidence = 0.95,
  competitorConfidence = 0.95,
): BrandComparisonResult['facts'][number] {
  return {
    key,
    valuesBySubjectId: {
      [OWNED_ID]: value('present', { [field]: owned }, 'owned', ownedConfidence),
      [COMPETITOR_ID]: value(
        'present',
        { [field]: competitor },
        'competitor',
        competitorConfidence,
      ),
    },
    numericDeltas: [
      {
        competitorSubjectId: COMPETITOR_ID,
        ownedValue: owned,
        competitorValue: competitor,
        difference: competitor - owned,
        unit,
      },
    ],
  };
}

function subscriptionAvailabilityFact(
  ownedConfidence = 0.95,
  competitorConfidence = 0.95,
): BrandComparisonResult['facts'][number] {
  return {
    key: 'subscription.available',
    valuesBySubjectId: {
      [OWNED_ID]: value('present', { available: true }, 'owned', ownedConfidence),
      [COMPETITOR_ID]: value('present', { available: true }, 'competitor', competitorConfidence),
    },
  };
}

function detect(
  facts: BrandComparisonResult['facts'],
  observedChanges: EvidenceEnrichedObservedChange[] = [],
) {
  return detectCompetitiveSignals({
    comparison: comparison(facts),
    observedChanges,
    generatedAt: GENERATED_AT,
  });
}

function observedChange(overrides: Partial<ObservedChange>): ObservedChange {
  return {
    id: CHANGE_ID,
    subjectId: COMPETITOR_ID,
    sourceId: COMPETITOR_SOURCE_ID,
    factType: 'offer.free_shipping',
    changeType: 'offer.free_shipping.threshold_changed',
    previousSnapshotId: PREVIOUS_SNAPSHOT_ID,
    currentSnapshotId: COMPETITOR_SNAPSHOT_ID,
    previousObservationId: PREVIOUS_OBSERVATION_ID,
    currentObservationId: COMPETITOR_OBSERVATION_ID,
    factIdentity: 'offer:free_shipping',
    beforeValue: { threshold: 75 },
    afterValue: { threshold: 50 },
    detectedAt: GENERATED_AT,
    detectorVersion: 'website-change-detector-v2',
    changeHash: `sha256:${'c'.repeat(64)}`,
    ...overrides,
  };
}

function changeEvidence(
  roles: Array<'previous' | 'current' | 'evaluation' | 'previous_evaluation'>,
  confidence = 0.95,
) {
  return roles.map((role) => ({
    role,
    sourceId: COMPETITOR_SOURCE_ID,
    snapshotId:
      role === 'previous' || role === 'previous_evaluation'
        ? PREVIOUS_SNAPSHOT_ID
        : COMPETITOR_SNAPSHOT_ID,
    observationId:
      role === 'evaluation'
        ? null
        : role === 'previous_evaluation'
          ? PRIOR_EVALUATION_OBSERVATION_ID
          : role === 'previous'
            ? PREVIOUS_OBSERVATION_ID
            : COMPETITOR_OBSERVATION_ID,
    observedChangeId: CHANGE_ID,
    confidence,
  }));
}

describe('detectCompetitiveSignals comparison rules', () => {
  it.each([
    [
      'offer.free_shipping_threshold',
      75,
      50,
      'usd',
      'threshold',
      'competitor_lower_free_shipping_threshold',
      'competitor_lower',
      "rival.test's free-shipping threshold is $25 lower than the owned brand's.",
    ],
    [
      'offer.free_shipping_threshold',
      50,
      75,
      'usd',
      'threshold',
      'competitor_higher_free_shipping_threshold',
      'competitor_higher',
      "rival.test's free-shipping threshold is $25 higher than the owned brand's.",
    ],
    [
      'policy.return_window',
      30,
      60,
      'days',
      'durationDays',
      'competitor_longer_return_window',
      'competitor_higher',
      "rival.test's return window is 30 days longer than the owned brand's.",
    ],
    [
      'policy.return_window',
      60,
      30,
      'days',
      'durationDays',
      'competitor_shorter_return_window',
      'competitor_lower',
      "rival.test's return window is 30 days shorter than the owned brand's.",
    ],
    [
      'policy.guarantee_duration',
      30,
      60,
      'days',
      'durationDays',
      'competitor_longer_guarantee_duration',
      'competitor_higher',
      "rival.test's guarantee duration is 30 days longer than the owned brand's.",
    ],
    [
      'subscription.discount',
      10,
      15,
      'percent',
      'discountPercent',
      'competitor_higher_subscription_discount',
      'competitor_higher',
      "rival.test's subscription discount is 5 percentage points higher than the owned brand's.",
    ],
  ] as const)(
    'emits %s numeric differences',
    (key, owned, competitor, unit, field, signalType, direction, statement) => {
      const facts = [numericFact(key, owned, competitor, unit, field)];
      if (key === 'subscription.discount') facts.push(subscriptionAvailabilityFact());
      const signals = detect(facts);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ signalType, direction, statement, comparisonKey: key });
      expect(signals[0]?.supportingValues).toEqual({
        owned,
        competitor,
        delta: competitor - owned,
        unit: unit === 'percent' ? 'percentage_points' : unit,
      });
      expect(signals[0]?.evidence.map((entry) => entry.role)).toEqual(['owned', 'competitor']);
    },
  );

  it('handles subscription presence in both directions', () => {
    const competitorOnly: BrandComparisonResult['facts'][number] = {
      key: 'subscription.available',
      valuesBySubjectId: {
        [OWNED_ID]: value('explicitly_absent', null, 'owned'),
        [COMPETITOR_ID]: value('present', { available: true }, 'competitor'),
      },
    };
    const ownedOnly: BrandComparisonResult['facts'][number] = {
      key: 'subscription.available',
      valuesBySubjectId: {
        [OWNED_ID]: value('present', { available: true }, 'owned'),
        [COMPETITOR_ID]: value('explicitly_absent', null, 'competitor'),
      },
    };
    expect(detect([competitorOnly])[0]).toMatchObject({
      signalType: 'competitor_offers_subscription_owned_does_not',
      direction: 'different',
      statement: 'rival.test offers a subscription while the owned brand does not.',
    });
    expect(detect([ownedOnly])[0]).toMatchObject({
      signalType: 'owned_offers_subscription_competitor_does_not',
      direction: 'different',
      statement: 'The owned brand offers a subscription while rival.test does not.',
    });
  });

  it('skips unknown and present-but-false subscription states', () => {
    const competitorOffers = value('present', { available: true }, 'competitor');
    expect(
      detect([
        {
          key: 'subscription.available',
          valuesBySubjectId: {
            [OWNED_ID]: value('unknown', null, 'owned'),
            [COMPETITOR_ID]: competitorOffers,
          },
        },
      ]),
    ).toEqual([]);
    expect(
      detect([
        {
          key: 'subscription.available',
          valuesBySubjectId: {
            [OWNED_ID]: value('present', { available: false }, 'owned'),
            [COMPETITOR_ID]: competitorOffers,
          },
        },
      ]),
    ).toEqual([]);
  });

  it.each([
    [
      'offer.discount:percentage:10',
      'competitor_offers_explicit_discount_owned_does_not',
      'owned_offers_explicit_discount_competitor_does_not',
      'rival.test offers an explicit discount while the owned brand does not.',
      'The owned brand offers an explicit discount while rival.test does not.',
    ],
    [
      'offer.promo:SAVE10',
      'competitor_offers_promotion_owned_does_not',
      'owned_offers_promotion_competitor_does_not',
      'rival.test offers a promotion while the owned brand does not.',
      'The owned brand offers a promotion while rival.test does not.',
    ],
    [
      'offer.bundle',
      'competitor_offers_bundle_owned_does_not',
      'owned_offers_bundle_competitor_does_not',
      'rival.test offers a bundle while the owned brand does not.',
      'The owned brand offers a bundle while rival.test does not.',
    ],
    [
      'offer.buy_x_get_y',
      'competitor_offers_bogo_owned_does_not',
      'owned_offers_bogo_competitor_does_not',
      'rival.test offers a buy-one-get-one offer while the owned brand does not.',
      'The owned brand offers a buy-one-get-one offer while rival.test does not.',
    ],
  ] as const)(
    'emits only present versus explicitly absent for %s',
    (key, competitorSignalType, ownedSignalType, competitorStatement, ownedStatement) => {
      const fact = {
        key,
        valuesBySubjectId: {
          [OWNED_ID]: value('explicitly_absent', null, 'owned'),
          [COMPETITOR_ID]: value(
            'present',
            key.startsWith('offer.discount:')
              ? { type: 'percentage', amount: 10 }
              : { text: 'offer' },
            'competitor',
          ),
        },
      };
      expect(detect([fact])[0]).toMatchObject({
        signalType: competitorSignalType,
        direction: 'different',
        statement: competitorStatement,
      });
      fact.valuesBySubjectId = {
        [OWNED_ID]: value(
          'present',
          key.startsWith('offer.discount:')
            ? { type: 'percentage', amount: 10 }
            : { text: 'offer' },
          'owned',
        ),
        [COMPETITOR_ID]: value('explicitly_absent', null, 'competitor'),
      };
      expect(detect([fact])[0]).toMatchObject({
        signalType: ownedSignalType,
        direction: 'different',
        statement: ownedStatement,
      });
      fact.valuesBySubjectId[OWNED_ID] = value('unknown', null, 'owned');
      expect(detect([fact])).toEqual([]);
    },
  );

  it('compares one explicit percentage discount but skips fixed, ambiguous, equal, and multiple offers', () => {
    const percentFacts = (owned: number, competitor: number): BrandComparisonResult['facts'] => [
      {
        key: `offer.discount:percentage:${owned}`,
        valuesBySubjectId: {
          [OWNED_ID]: value('present', { type: 'percentage', amount: owned }, 'owned'),
          [COMPETITOR_ID]: value('unknown', null, 'competitor'),
        },
      },
      {
        key: `offer.discount:percentage:${competitor}`,
        valuesBySubjectId: {
          [OWNED_ID]: value('unknown', null, 'owned'),
          [COMPETITOR_ID]: value(
            'present',
            { type: 'percentage', amount: competitor },
            'competitor',
          ),
        },
      },
    ];
    expect(detect(percentFacts(10, 15))[0]).toMatchObject({
      signalType: 'competitor_higher_explicit_percentage_discount',
      statement:
        "rival.test's explicit percentage discount is 5 percentage points higher than the owned brand's.",
    });
    expect(detect(percentFacts(10, 10))).toEqual([]);
    expect(
      detect([
        {
          key: 'offer.discount:fixed:10',
          valuesBySubjectId: {
            [OWNED_ID]: value('present', { type: 'fixed', amount: 5 }, 'owned'),
            [COMPETITOR_ID]: value('present', { type: 'fixed', amount: 10 }, 'competitor'),
          },
        },
      ]),
    ).toEqual([]);
    expect(detect([...percentFacts(5, 10), ...percentFacts(15, 20)])).toEqual([]);
  });

  it('binds static discount keys to normalized payload type and amount', () => {
    const mismatchedPresence = {
      key: 'offer.discount:fixed:10',
      valuesBySubjectId: {
        [OWNED_ID]: value('explicitly_absent', null, 'owned'),
        [COMPETITOR_ID]: value('present', { type: 'percentage', amount: 10 }, 'competitor'),
      },
    };
    const validOwned = {
      key: 'offer.discount:percentage:10',
      valuesBySubjectId: {
        [OWNED_ID]: value('present', { type: 'percentage', amount: 10 }, 'owned'),
        [COMPETITOR_ID]: value('unknown', null, 'competitor'),
      },
    };
    const mismatchedCompetitor = {
      key: 'offer.discount:percentage:20',
      valuesBySubjectId: {
        [OWNED_ID]: value('unknown', null, 'owned'),
        [COMPETITOR_ID]: value('present', { type: 'percentage', amount: 15 }, 'competitor'),
      },
    };
    expect(detect([mismatchedPresence])).toEqual([]);
    expect(detect([validOwned, mismatchedCompetitor])).toEqual([]);
  });

  it('skips equal and unknown numeric comparisons', () => {
    expect(
      detect([numericFact('offer.free_shipping_threshold', 50, 50, 'usd', 'threshold')]),
    ).toEqual([]);
    const unknown = numericFact('policy.return_window', 30, 60, 'days', 'durationDays');
    unknown.valuesBySubjectId[COMPETITOR_ID] = value('unknown', null, 'competitor');
    expect(detect([unknown])).toEqual([]);
  });

  it('requires active subscription availability on both sides for discount comparisons', () => {
    const discount = numericFact('subscription.discount', 10, 15, 'percent', 'discountPercent');
    expect(detect([discount])).toEqual([]);

    const inactive = subscriptionAvailabilityFact();
    inactive.valuesBySubjectId[OWNED_ID] = value('present', { available: false }, 'owned');
    expect(detect([discount, inactive])).toEqual([]);
  });

  it('includes distinct availability lineage in subscription discount confidence', () => {
    const discount = numericFact('subscription.discount', 10, 15, 'percent', 'discountPercent');
    const availability = subscriptionAvailabilityFact(0.8, 0.95);
    availability.valuesBySubjectId[OWNED_ID]!.provenance!.observationId =
      '12121212-1212-4212-8212-121212121212';
    availability.valuesBySubjectId[COMPETITOR_ID]!.provenance!.observationId =
      '13131313-1313-4313-8313-131313131313';

    const signal = detect([discount, availability])[0];
    expect(signal?.confidence).toBe('medium');
    expect(signal?.evidence).toHaveLength(4);
    expect(signal?.evidence.map((reference) => reference.observationId)).toEqual([
      OWNED_OBSERVATION_ID,
      COMPETITOR_OBSERVATION_ID,
      '12121212-1212-4212-8212-121212121212',
      '13131313-1313-4313-8313-131313131313',
    ]);
  });

  it('emits exact normalized positioning differences and skips equal values', () => {
    const fact = {
      key: 'positioning.homepage.headline',
      valuesBySubjectId: {
        [OWNED_ID]: value('present', { headline: 'Owned headline' }, 'owned'),
        [COMPETITOR_ID]: value('present', { headline: 'Rival headline' }, 'competitor'),
      },
    };
    expect(detect([fact])[0]).toMatchObject({
      signalType: 'positioning_differs',
      direction: 'different',
      statement: "rival.test's homepage headline differs from the owned brand's.",
      supportingValues: { owned: 'Owned headline', competitor: 'Rival headline' },
    });
    fact.valuesBySubjectId[COMPETITOR_ID] = value(
      'present',
      { headline: 'Owned headline' },
      'competitor',
    );
    expect(detect([fact])).toEqual([]);
  });

  it('compares normalized primary CTA values and skips normalized equality', () => {
    const fact = {
      key: 'positioning.homepage.primary_cta',
      valuesBySubjectId: {
        [OWNED_ID]: value('present', { primaryCta: 'Shop Now' }, 'owned'),
        [COMPETITOR_ID]: value('present', { primaryCta: 'Learn More' }, 'competitor'),
      },
    };
    expect(detect([fact])[0]).toMatchObject({
      signalType: 'positioning_differs',
      direction: 'different',
      statement: "rival.test's homepage primary CTA differs from the owned brand's.",
    });
    fact.valuesBySubjectId[COMPETITOR_ID] = value(
      'present',
      { primaryCta: 'Shop Now' },
      'competitor',
    );
    expect(detect([fact])).toEqual([]);
  });

  it('uses the weakest evidence confidence and skips incoherent provenance', () => {
    expect(
      detect([
        numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold', 0.95, 0.9),
      ])[0]?.confidence,
    ).toBe('high');
    expect(
      detect([
        numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold', 0.95, 0.75),
      ])[0]?.confidence,
    ).toBe('medium');
    expect(
      detect([
        numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold', 0.95, 0.74),
      ])[0]?.confidence,
    ).toBe('low');
    const incoherent = numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold');
    incoherent.numericDeltas![0]!.difference = 20;
    expect(detect([incoherent])).toEqual([]);
  });

  it('does not render a finite nonzero delta as zero', () => {
    const signal = detect([
      numericFact('offer.free_shipping_threshold', 1, 1.00001, 'usd', 'threshold'),
    ])[0];
    expect(signal?.supportingValues.delta).toBeCloseTo(0.00001, 10);
    expect(signal?.statement).toContain('$0.00001 higher');
    expect(signal?.statement).not.toContain('$0 higher');
  });
});

describe('detectCompetitiveSignals observed-change rules', () => {
  it.each([
    [
      'offer.free_shipping.threshold_changed',
      { threshold: 75 },
      { threshold: 50 },
      'competitor_lowered_free_shipping_threshold',
      'competitor_lower',
      'rival.test lowered its free-shipping threshold from $75 to $50.',
      'offer.free_shipping',
      'offer:free_shipping',
    ],
    [
      'offer.free_shipping.threshold_changed',
      { threshold: 50 },
      { threshold: 75 },
      'competitor_raised_free_shipping_threshold',
      'competitor_higher',
      'rival.test raised its free-shipping threshold from $50 to $75.',
      'offer.free_shipping',
      'offer:free_shipping',
    ],
    [
      'subscription.discount.changed',
      { available: true, discountPercent: 10 },
      { available: true, discountPercent: 15 },
      'competitor_increased_subscription_discount',
      'competitor_higher',
      'rival.test increased its subscription discount from 10% to 15%.',
      'subscription.details',
      'subscription:details',
    ],
    [
      'policy.guarantee.duration_changed',
      { durationDays: 30 },
      { durationDays: 60 },
      'competitor_extended_guarantee_duration',
      'competitor_higher',
      'rival.test extended its guarantee duration from 30 days to 60 days.',
      'policy.guarantee',
      'policy:guarantee',
    ],
    [
      'policy.return_window.duration_changed',
      { durationDays: 60 },
      { durationDays: 30 },
      'competitor_shortened_return_window',
      'competitor_lower',
      'rival.test shortened its return window from 60 days to 30 days.',
      'policy.return_window',
      'policy:return_window',
    ],
    [
      'positioning.homepage.headline_changed',
      { headline: 'Old headline' },
      { headline: 'New headline' },
      'competitor_changed_homepage_headline',
      'different',
      'rival.test changed its homepage headline.',
      'positioning.homepage',
      'positioning:homepage:headline',
    ],
  ] as const)(
    'emits a neutral signal for %s',
    (
      changeType,
      beforeValue,
      afterValue,
      signalType,
      direction,
      statement,
      factType,
      factIdentity,
    ) => {
      const changes = [
        {
          change: observedChange({
            changeType,
            beforeValue,
            afterValue,
            factType,
            factIdentity,
          }),
          evidence: changeEvidence(['previous', 'current']),
        },
      ];
      expect(detect([], changes)[0]).toMatchObject({ signalType, direction, statement });
    },
  );

  it.each([
    [
      'offer.free_shipping.threshold_changed',
      'offer.free_shipping',
      'offer:free_shipping',
      { threshold: 75 },
      { threshold: 50 },
      ['previous', 'current'],
    ],
    [
      'offer.discount.changed',
      'offer.discount',
      'offer:discount:percentage:10',
      { type: 'percentage', amount: 10 },
      { type: 'percentage', amount: 15 },
      ['previous', 'current'],
    ],
    [
      'subscription.discount.changed',
      'subscription.details',
      'subscription:details',
      { available: true, discountPercent: 10 },
      { available: true, discountPercent: 15 },
      ['previous', 'current'],
    ],
    [
      'policy.guarantee.duration_changed',
      'policy.guarantee',
      'policy:guarantee',
      { durationDays: 30 },
      { durationDays: 60 },
      ['previous', 'current'],
    ],
    [
      'policy.return_window.duration_changed',
      'policy.return_window',
      'policy:return_window',
      { durationDays: 30 },
      { durationDays: 60 },
      ['previous', 'current'],
    ],
    [
      'subscription.added',
      'subscription.details',
      'subscription:details',
      null,
      { available: true },
      ['previous_evaluation', 'current'],
    ],
    [
      'subscription.removed',
      'subscription.details',
      'subscription:details',
      { available: true },
      null,
      ['previous', 'evaluation'],
    ],
    [
      'offer.promo.added',
      'offer.promo',
      'offer:promo:SAVE10',
      null,
      { code: 'SAVE10' },
      ['previous_evaluation', 'current'],
    ],
    [
      'offer.promo.removed',
      'offer.promo',
      'offer:promo:SAVE10',
      { code: 'SAVE10' },
      null,
      ['previous', 'evaluation'],
    ],
    [
      'positioning.homepage.headline_changed',
      'positioning.homepage',
      'positioning:homepage:headline',
      { headline: 'Old headline' },
      { headline: 'New headline' },
      ['previous', 'current'],
    ],
  ] as const)(
    'suppresses incoherent %s fact type and identity',
    (changeType, factType, factIdentity, beforeValue, afterValue, roles) => {
      const coherentBase = {
        changeType,
        factType,
        factIdentity,
        beforeValue,
        afterValue,
        ...(changeType.endsWith('.added') ? { previousObservationId: null } : {}),
      };
      expect(
        detect(
          [],
          [
            {
              change: observedChange({ ...coherentBase, factType: 'product.price' }),
              evidence: changeEvidence([...roles]),
            },
          ],
        ),
      ).toEqual([]);
      expect(
        detect(
          [],
          [
            {
              change: observedChange({ ...coherentBase, factIdentity: 'unrelated:fact' }),
              evidence: changeEvidence([...roles]),
            },
          ],
        ),
      ).toEqual([]);
    },
  );

  it('suppresses malformed promotion addition payloads', () => {
    const evidence = changeEvidence(['previous_evaluation', 'current']);
    const addition = {
      factType: 'offer.promo',
      changeType: 'offer.promo.added' as const,
      factIdentity: 'offer:promo:SAVE10',
      beforeValue: null,
      previousObservationId: null,
    };
    expect(
      detect(
        [],
        [
          {
            change: observedChange({ ...addition, afterValue: { code: 'OTHER' } }),
            evidence,
          },
        ],
      ),
    ).toEqual([]);
    expect(
      detect(
        [],
        [
          {
            change: observedChange({ ...addition, afterValue: { code: '' } }),
            evidence,
          },
        ],
      ),
    ).toEqual([]);
  });

  it('suppresses standalone percentage discount amount changes', () => {
    const change = observedChange({
      factType: 'offer.discount',
      factIdentity: 'offer:discount:percentage:10',
      changeType: 'offer.discount.changed',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: { type: 'percentage', amount: 15 },
    });
    expect(detect([], [{ change, evidence: changeEvidence(['previous', 'current']) }])).toEqual([]);
  });

  it('requires an active subscription before and after discount changes', () => {
    const base = {
      factType: 'subscription.details',
      factIdentity: 'subscription:details',
      changeType: 'subscription.discount.changed' as const,
    };
    expect(
      detect(
        [],
        [
          {
            change: observedChange({
              ...base,
              beforeValue: { available: false, discountPercent: 10 },
              afterValue: { available: true, discountPercent: 15 },
            }),
            evidence: changeEvidence(['previous', 'current']),
          },
        ],
      ),
    ).toEqual([]);
    expect(
      detect(
        [],
        [
          {
            change: observedChange({
              ...base,
              beforeValue: { available: true, discountPercent: 10 },
              afterValue: { discountPercent: 15 },
            }),
            evidence: changeEvidence(['previous', 'current']),
          },
        ],
      ),
    ).toEqual([]);
  });

  it('handles added/removed subscription and promotion with required evidence roles', () => {
    const additions = [
      observedChange({
        factType: 'subscription.details',
        changeType: 'subscription.added',
        factIdentity: 'subscription:details',
        beforeValue: null,
        afterValue: { available: true },
        previousObservationId: null,
      }),
      observedChange({
        factType: 'offer.promo',
        changeType: 'offer.promo.added',
        factIdentity: 'offer:promo:SAVE10',
        beforeValue: null,
        afterValue: { code: 'SAVE10' },
        previousObservationId: null,
      }),
    ];
    const removals = [
      observedChange({
        factType: 'subscription.details',
        changeType: 'subscription.removed',
        factIdentity: 'subscription:details',
        beforeValue: { available: true },
        afterValue: null,
      }),
      observedChange({
        factType: 'offer.promo',
        changeType: 'offer.promo.removed',
        factIdentity: 'offer:promo:SAVE10',
        beforeValue: { code: 'SAVE10' },
        afterValue: null,
      }),
    ];
    expect(
      additions.map(
        (change) =>
          detect([], [{ change, evidence: changeEvidence(['previous_evaluation', 'current']) }])[0]
            ?.signalType,
      ),
    ).toEqual(['competitor_added_subscription', 'competitor_added_promotion']);
    expect(
      removals.map(
        (change) =>
          detect([], [{ change, evidence: changeEvidence(['previous', 'evaluation']) }])[0]
            ?.signalType,
      ),
    ).toEqual(['competitor_removed_subscription', 'competitor_removed_promotion']);
    expect(detect([], [{ change: removals[0]!, evidence: changeEvidence(['previous']) }])).toEqual(
      [],
    );
    expect(detect([], [{ change: additions[0]!, evidence: changeEvidence(['current']) }])).toEqual(
      [],
    );
    expect(
      detect(
        [],
        [
          {
            change: additions[0]!,
            evidence: changeEvidence(['previous_evaluation', 'current', 'evaluation']),
          },
        ],
      ),
    ).toEqual([]);

    const high = detect(
      [],
      [
        {
          change: additions[0]!,
          evidence: changeEvidence(['previous_evaluation', 'current'], 0.9),
        },
      ],
    )[0];
    const mediumEvidence = changeEvidence(['previous_evaluation', 'current'], 0.95).map(
      (reference) =>
        reference.role === 'previous_evaluation' ? { ...reference, confidence: 0.8 } : reference,
    );
    const medium = detect([], [{ change: additions[0]!, evidence: mediumEvidence }])[0];
    expect(high).toMatchObject({
      confidence: 'high',
      evidence: [{ role: 'previous_evaluation' }, { role: 'current' }],
    });
    expect(medium?.confidence).toBe('medium');
  });

  it('pairs exactly one percentage discount removal and addition into one changed signal', () => {
    const removed = observedChange({
      id: CHANGE_ID,
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:discount:percentage:10',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: null,
      currentObservationId: null,
    });
    const added = observedChange({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      factType: 'offer.discount',
      changeType: 'offer.discount.added',
      factIdentity: 'offer:discount:percentage:15',
      beforeValue: null,
      afterValue: { type: 'percentage', amount: 15 },
      previousObservationId: null,
    });
    const changes = [
      { change: removed, evidence: changeEvidence(['previous', 'evaluation']) },
      {
        change: added,
        evidence: changeEvidence(['current']).map((entry) => ({
          ...entry,
          observedChangeId: added.id,
        })),
      },
    ];
    const signals = detect([], changes);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      signalType: 'competitor_increased_explicit_percentage_discount',
      statement: 'rival.test increased its explicit percentage discount from 10% to 15%.',
      supportingValues: { previous: 10, current: 15, delta: 5, unit: 'percentage_points' },
    });
    expect(signals[0]?.evidence.map((entry) => entry.observedChangeId)).toEqual([
      CHANGE_ID,
      CHANGE_ID,
      added.id,
    ]);
  });

  it('does not pair percentage discount changes from different prior snapshots', () => {
    const removed = observedChange({
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:discount:percentage:10',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: null,
      currentObservationId: null,
    });
    const added = observedChange({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      factType: 'offer.discount',
      changeType: 'offer.discount.added',
      factIdentity: 'offer:discount:percentage:15',
      beforeValue: null,
      afterValue: { type: 'percentage', amount: 15 },
      previousSnapshotId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      previousObservationId: null,
    });
    expect(
      detect(
        [],
        [
          { change: removed, evidence: changeEvidence(['previous', 'evaluation']) },
          {
            change: added,
            evidence: changeEvidence(['current']).map((entry) => ({
              ...entry,
              observedChangeId: added.id,
            })),
          },
        ],
      ),
    ).toEqual([]);
  });

  it('does not pair percentage discount changes with incoherent identities', () => {
    const removed = observedChange({
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:promo:SAVE10',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: null,
      currentObservationId: null,
    });
    const added = observedChange({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      factType: 'offer.discount',
      changeType: 'offer.discount.added',
      factIdentity: 'offer:discount:percentage:15',
      beforeValue: null,
      afterValue: { type: 'percentage', amount: 15 },
      previousObservationId: null,
    });
    expect(
      detect(
        [],
        [
          { change: removed, evidence: changeEvidence(['previous', 'evaluation']) },
          {
            change: added,
            evidence: changeEvidence(['current']).map((reference) => ({
              ...reference,
              observedChangeId: added.id,
            })),
          },
        ],
      ),
    ).toEqual([]);
  });

  it('does not pair percentage discounts whose identities mismatch payload amounts', () => {
    const removed = observedChange({
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:discount:percentage:20',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: null,
      currentObservationId: null,
    });
    const added = observedChange({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      factType: 'offer.discount',
      changeType: 'offer.discount.added',
      factIdentity: 'offer:discount:percentage:15',
      beforeValue: null,
      afterValue: { type: 'percentage', amount: 15 },
      previousObservationId: null,
    });
    expect(
      detect(
        [],
        [
          { change: removed, evidence: changeEvidence(['previous', 'evaluation']) },
          {
            change: added,
            evidence: changeEvidence(['current']).map((reference) => ({
              ...reference,
              observedChangeId: added.id,
            })),
          },
        ],
      ),
    ).toEqual([]);
  });

  it('skips ambiguous multiple percentage discount change pairs', () => {
    const firstRemoval = observedChange({
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:discount:percentage:10',
      beforeValue: { type: 'percentage', amount: 10 },
      afterValue: null,
      currentObservationId: null,
    });
    const secondRemoval = observedChange({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      factType: 'offer.discount',
      changeType: 'offer.discount.removed',
      factIdentity: 'offer:discount:percentage:20',
      beforeValue: { type: 'percentage', amount: 20 },
      afterValue: null,
      currentObservationId: null,
    });
    const addition = observedChange({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      factType: 'offer.discount',
      changeType: 'offer.discount.added',
      factIdentity: 'offer:discount:percentage:15',
      beforeValue: null,
      afterValue: { type: 'percentage', amount: 15 },
      previousObservationId: null,
    });
    const evidenceFor = (
      change: ObservedChange,
      roles: Array<'previous' | 'current' | 'evaluation'>,
    ) =>
      changeEvidence(roles).map((reference) => ({
        ...reference,
        observedChangeId: change.id,
      }));
    expect(
      detect(
        [],
        [
          { change: firstRemoval, evidence: evidenceFor(firstRemoval, ['previous', 'evaluation']) },
          {
            change: secondRemoval,
            evidence: evidenceFor(secondRemoval, ['previous', 'evaluation']),
          },
          { change: addition, evidence: evidenceFor(addition, ['current']) },
        ],
      ),
    ).toEqual([]);
  });

  it('skips owned-subject changes, missing roles, unknown values, and ambiguous discount pairs', () => {
    const base = observedChange({});
    expect(
      detect(
        [],
        [
          {
            change: { ...base, subjectId: OWNED_ID },
            evidence: changeEvidence(['previous', 'current']),
          },
        ],
      ),
    ).toEqual([]);
    expect(detect([], [{ change: base, evidence: changeEvidence(['current']) }])).toEqual([]);
    expect(
      detect(
        [],
        [
          {
            change: { ...base, afterValue: {} },
            evidence: changeEvidence(['previous', 'current']),
          },
        ],
      ),
    ).toEqual([]);
  });
});

describe('competitive signal determinism and safety', () => {
  it('sorts output and hashes canonical evidence independent of input and generatedAt', () => {
    const facts = [
      numericFact('policy.return_window', 30, 60, 'days', 'durationDays'),
      numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold'),
    ];
    const first = detectCompetitiveSignals({
      comparison: comparison(facts),
      observedChanges: [],
      generatedAt: GENERATED_AT,
    });
    const reordered = detectCompetitiveSignals({
      comparison: comparison([...facts].reverse()),
      observedChanges: [],
      generatedAt: '2026-09-04T12:00:00.000Z',
    });
    expect(first.map((signal) => signal.signalType)).toEqual([
      'competitor_lower_free_shipping_threshold',
      'competitor_longer_return_window',
    ]);
    expect(reordered.map((signal) => signal.signalHash)).toEqual(
      first.map((signal) => signal.signalHash),
    );
    expect(first.every((signal) => signal.ruleVersion === COMPETITIVE_SIGNAL_RULE_VERSION)).toBe(
      true,
    );

    const changedEvidence = numericFact(
      'offer.free_shipping_threshold',
      75,
      50,
      'usd',
      'threshold',
    );
    changedEvidence.valuesBySubjectId[COMPETITOR_ID]!.provenance!.snapshotId = PREVIOUS_SNAPSHOT_ID;
    expect(detect([changedEvidence])[0]?.signalHash).not.toBe(first[0]?.signalHash);
  });

  it('never emits recommendation, hypothesis, experiment, causal, AI, or persuasive language', () => {
    const signals = detect([
      numericFact('offer.free_shipping_threshold', 75, 50, 'usd', 'threshold'),
      numericFact('policy.return_window', 30, 60, 'days', 'durationDays'),
    ]);
    for (const signal of signals) {
      expect(signal).not.toHaveProperty('recommendation');
      expect(signal).not.toHaveProperty('hypothesis');
      expect(signal).not.toHaveProperty('experiment');
      expect(signal).not.toHaveProperty('aiProvenance');
      expect(signal.statement).not.toMatch(/better|stronger|effective|growth|conversion|revenue/i);
    }
  });
});
