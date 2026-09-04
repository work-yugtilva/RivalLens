import {
  generateRecommendedExperiments,
  generateStrategicHypotheses,
} from '../../../packages/intelligence/src';
import {
  recommendedExperimentSchema,
  strategicHypothesisSchema,
  type CompetitiveSignal,
  type CompetitiveSignalType,
  type CompetitiveSignalSupportingValues,
} from '../../../packages/schemas/src';

export const BRAND_ID = '11111111-1111-4111-8111-111111111111';
export const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
export const GENERATED_AT = '2026-09-04T12:00:00.000Z';
export const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export function signal(
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
    supportingValues,
    statement: `Observed ${signalType}.`,
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
export const shipping = (index = 1) =>
  signal('competitor_lower_free_shipping_threshold', index, 'offer.free_shipping_threshold', {
    owned: 75,
    competitor: 50,
    delta: -25,
    unit: 'usd',
  });
export const qualifyingSignals = [
  shipping(),
  signal('competitor_longer_return_window', 2, 'policy.return_window', {
    owned: 30,
    competitor: 60,
    delta: 30,
    unit: 'days',
  }),
  signal('competitor_longer_guarantee_duration', 3, 'policy.guarantee_duration', {
    owned: 30,
    competitor: 90,
    delta: 60,
    unit: 'days',
  }),
  signal('competitor_offers_subscription_owned_does_not', 4, 'subscription.available', {
    owned: false,
    competitor: true,
  }),
  signal('competitor_higher_subscription_discount', 5, 'subscription.discount', {
    owned: 5,
    competitor: 10,
    delta: 5,
    unit: 'percentage_points',
  }),
  signal(
    'competitor_higher_explicit_percentage_discount',
    6,
    'offer.discount.explicit_percentage',
    { owned: 10, competitor: 20, delta: 10, unit: 'percentage_points' },
  ),
  signal('competitor_offers_bundle_owned_does_not', 7, 'offer.bundle', {
    owned: false,
    competitor: true,
  }),
  signal('competitor_offers_bogo_owned_does_not', 8, 'offer.buy_x_get_y', {
    owned: false,
    competitor: true,
  }),
  signal('competitor_offers_explicit_discount_owned_does_not', 9, 'offer.discount:fixed:10', {
    owned: false,
    competitor: true,
  }),
];
export function hypotheses(signals: CompetitiveSignal[], offset = 100) {
  return generateStrategicHypotheses({ currentSignals: signals, generatedAt: GENERATED_AT }).map(
    (candidate, index) =>
      strategicHypothesisSchema.parse({ ...candidate, id: uuid(offset + index) }),
  );
}
export function experiments(
  signals: CompetitiveSignal[],
  current = hypotheses(signals),
  offset = 200,
) {
  return generateRecommendedExperiments({
    currentHypotheses: current,
    supportingSignals: signals,
    generatedAt: GENERATED_AT,
  }).map((candidate, index) =>
    recommendedExperimentSchema.parse({ ...candidate, id: uuid(offset + index) }),
  );
}
