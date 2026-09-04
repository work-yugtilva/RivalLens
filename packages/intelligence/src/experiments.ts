import { createHash } from 'node:crypto';
import {
  competitiveSignalSchema,
  recommendedExperimentCandidateSchema,
  strategicHypothesisSchema,
  RECOMMENDED_EXPERIMENT_CANONICAL_COPY,
  type CompetitiveSignal,
  type ExperimentMetricName,
  type RecommendedExperimentCandidate,
  type RecommendedExperimentType,
  type StrategicHypothesis,
} from '@rivallens/schemas';

export const RECOMMENDED_EXPERIMENT_ENGINE_VERSION = 'recommended-experiments-v1';
export const SUPPORTED_EXPERIMENT_HYPOTHESIS_ENGINE_VERSION = 'strategic-hypotheses-v1';

export type GenerateRecommendedExperimentsInput = {
  currentHypotheses: StrategicHypothesis[];
  supportingSignals: CompetitiveSignal[];
  generatedAt: string;
};

const metric = (name: ExperimentMetricName) => ({
  metric: name,
  measurementReadiness: 'requires_first_party_data' as const,
});

const METRICS: Record<
  RecommendedExperimentType,
  {
    primary: ExperimentMetricName;
    guardrails: ExperimentMetricName[];
  }
> = {
  free_shipping_threshold: {
    primary: 'checkout_conversion_rate',
    guardrails: ['contribution_margin_per_order', 'shipping_cost_per_order', 'average_order_value'],
  },
  return_window_policy: {
    primary: 'conversion_rate',
    guardrails: ['return_rate', 'refund_rate', 'contribution_margin_per_order'],
  },
  guarantee_policy: {
    primary: 'conversion_rate',
    guardrails: ['return_rate', 'refund_rate', 'contribution_margin_per_order'],
  },
  subscription_availability: {
    primary: 'subscription_take_rate',
    guardrails: [
      'conversion_rate',
      'contribution_margin_per_order',
      'subscription_cancellation_rate',
    ],
  },
  subscription_discount: {
    primary: 'subscription_take_rate',
    guardrails: [
      'conversion_rate',
      'contribution_margin_per_order',
      'subscription_cancellation_rate',
    ],
  },
  explicit_discount: {
    primary: 'conversion_rate',
    guardrails: ['contribution_margin_per_order', 'average_order_value'],
  },
  bundle_offer: {
    primary: 'conversion_rate',
    guardrails: ['contribution_margin_per_order', 'average_order_value'],
  },
  bogo_offer: {
    primary: 'conversion_rate',
    guardrails: ['contribution_margin_per_order', 'average_order_value'],
  },
};

const IMPLEMENTATION_NOTES: Record<RecommendedExperimentType, string[]> = {
  free_shipping_threshold: [
    'Select the treatment threshold after reviewing unit economics; use the competitor threshold only as a reference point.',
    'Keep other shipping and checkout variables unchanged during the controlled comparison.',
  ],
  return_window_policy: [
    'Confirm the policy variant is operationally supportable before launch and configure the treatment duration explicitly.',
    'Keep other policies and offers unchanged during the controlled comparison.',
  ],
  guarantee_policy: [
    'Confirm the guarantee variant is operationally supportable before launch and configure the treatment duration explicitly.',
    'Keep other policies and offers unchanged during the controlled comparison.',
  ],
  subscription_availability: [
    'Limit the treatment to eligible product pages and configure subscription terms before launch.',
    'Keep non-subscription pricing and merchandising unchanged during the controlled comparison.',
  ],
  subscription_discount: [
    'Configure the treatment discount after reviewing contribution margin.',
    'Keep subscription placement, eligibility, and non-discount terms unchanged during the controlled comparison.',
  ],
  explicit_discount: [
    'Configure one explicit discount variant after reviewing contribution margin; the competitor amount is reference-only.',
    'Keep other offers and experience elements unchanged during the controlled comparison.',
  ],
  bundle_offer: [
    'Configure one bundle definition and its eligibility after reviewing contribution margin.',
    'Keep other offers and experience elements unchanged during the controlled comparison.',
  ],
  bogo_offer: [
    'Configure one BOGO definition and its eligibility after reviewing contribution margin.',
    'Keep other offers and experience elements unchanged during the controlled comparison.',
  ],
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function experimentHash(input: {
  experimentType: RecommendedExperimentType;
  ownedBrandId: string;
  competitorId: string;
  sourceHypothesisIds: string[];
  control: unknown;
  treatment: unknown;
}): string {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify(
        stableValue({
          ownedBrandId: input.ownedBrandId,
          competitorId: input.competitorId,
          experimentType: input.experimentType,
          sourceHypothesisIds: input.sourceHypothesisIds,
          control: input.control,
          treatment: input.treatment,
          experimentEngineVersion: RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
        }),
      ),
    )
    .digest('hex')}`;
}

function common(
  experimentType: RecommendedExperimentType,
  hypothesis: StrategicHypothesis,
  generatedAt: string,
  eligibilityRuleId: string,
) {
  const copy = RECOMMENDED_EXPERIMENT_CANONICAL_COPY[experimentType];
  const metrics = METRICS[experimentType];
  return {
    experimentType,
    ownedBrandId: hypothesis.ownedBrandId,
    competitorId: hypothesis.competitorId,
    sourceHypothesisIds: [hypothesis.id],
    title: copy.title,
    objective: copy.objective,
    hypothesisUnderTest: copy.hypothesisUnderTest,
    design: {
      comparison: 'control_vs_treatment' as const,
      variablePolicy: 'single_variable' as const,
      heldConstant: 'all_non_target_experience_elements' as const,
    },
    primaryMetric: metric(metrics.primary),
    guardrailMetrics: metrics.guardrails.map(metric),
    durationPlanning: {
      status: 'requires_first_party_data' as const,
      requiredInputs: [
        'baseline_primary_metric',
        'eligible_traffic',
        'minimum_detectable_effect',
        'significance_level',
        'statistical_power',
      ] as const,
    },
    implementationNotes: IMPLEMENTATION_NOTES[experimentType],
    confidence: {
      level: hypothesis.confidence,
      basis: 'support_for_testing_rationale' as const,
    },
    caveat: copy.caveat,
    generatedAt,
    experimentEngineVersion: RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
    generationProvenance: {
      method: 'deterministic_rule' as const,
      eligibilityRuleId,
      templateId: experimentType,
      sourceHypothesisEngineVersion: SUPPORTED_EXPERIMENT_HYPOTHESIS_ENGINE_VERSION,
    },
  };
}

function numericComparison(
  signal: CompetitiveSignal,
  expectedUnit: 'usd' | 'days' | 'percentage_points',
  direction: 'lower' | 'higher',
): { owned: number; competitor: number } | null {
  const { owned, competitor, delta, unit } = signal.supportingValues;
  if (
    typeof owned !== 'number' ||
    !Number.isFinite(owned) ||
    owned < 0 ||
    typeof competitor !== 'number' ||
    !Number.isFinite(competitor) ||
    competitor < 0 ||
    typeof delta !== 'number' ||
    !Number.isFinite(delta) ||
    unit !== expectedUnit ||
    delta !== competitor - owned ||
    (direction === 'lower' ? competitor >= owned : competitor <= owned)
  )
    return null;
  return { owned, competitor };
}

function finish(
  base: ReturnType<typeof common>,
  control: unknown,
  treatment: unknown,
): RecommendedExperimentCandidate {
  return recommendedExperimentCandidateSchema.parse({
    ...base,
    control,
    treatment,
    experimentHash: experimentHash({ ...base, control, treatment }),
  });
}

function buildForSignal(
  hypothesis: StrategicHypothesis,
  signal: CompetitiveSignal,
  generatedAt: string,
): RecommendedExperimentCandidate | null {
  if (
    hypothesis.hypothesisType === 'competitor_may_reduce_shipping_friction' &&
    signal.signalType === 'competitor_lower_free_shipping_threshold'
  ) {
    const values = numericComparison(signal, 'usd', 'lower');
    if (!values || signal.comparisonKey !== 'offer.free_shipping_threshold') return null;
    const base = common(
      'free_shipping_threshold',
      hypothesis,
      generatedAt,
      'shipping-lower-threshold-v1',
    );
    return finish(
      base,
      { kind: 'current_free_shipping_threshold', thresholdUsd: values.owned },
      {
        kind: 'configurable_lower_free_shipping_threshold',
        thresholdUsd: { status: 'requires_user_configuration' },
        constraint: 'lower_than_control',
        competitorReferenceThresholdUsd: values.competitor,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_reduce_perceived_purchase_risk' &&
    signal.signalType === 'competitor_longer_return_window'
  ) {
    const values = numericComparison(signal, 'days', 'higher');
    if (!values || signal.comparisonKey !== 'policy.return_window') return null;
    const base = common(
      'return_window_policy',
      hypothesis,
      generatedAt,
      'policy-longer-return-window-v1',
    );
    return finish(
      base,
      { kind: 'current_return_window', durationDays: values.owned },
      {
        kind: 'configurable_longer_return_window',
        durationDays: { status: 'requires_user_configuration' },
        constraint: 'longer_than_control',
        competitorReferenceDurationDays: values.competitor,
        operationalReviewRequired: true,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_reduce_perceived_purchase_risk' &&
    signal.signalType === 'competitor_longer_guarantee_duration'
  ) {
    const values = numericComparison(signal, 'days', 'higher');
    if (!values || signal.comparisonKey !== 'policy.guarantee_duration') return null;
    const base = common('guarantee_policy', hypothesis, generatedAt, 'policy-longer-guarantee-v1');
    return finish(
      base,
      { kind: 'current_guarantee', durationDays: values.owned },
      {
        kind: 'configurable_longer_guarantee',
        durationDays: { status: 'requires_user_configuration' },
        constraint: 'longer_than_control',
        competitorReferenceDurationDays: values.competitor,
        operationalReviewRequired: true,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_repeat_purchase_mechanics' &&
    signal.signalType === 'competitor_offers_subscription_owned_does_not'
  ) {
    if (
      signal.comparisonKey !== 'subscription.available' ||
      signal.supportingValues.owned !== false ||
      signal.supportingValues.competitor !== true
    )
      return null;
    const base = common(
      'subscription_availability',
      hypothesis,
      generatedAt,
      'subscription-availability-v1',
    );
    return finish(
      base,
      { kind: 'current_one_time_purchase_only' },
      {
        kind: 'visible_subscribe_and_save_option',
        discountPercent: { status: 'requires_user_configuration' },
        competitorReferenceAvailable: true,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_repeat_purchase_mechanics' &&
    signal.signalType === 'competitor_higher_subscription_discount'
  ) {
    const values = numericComparison(signal, 'percentage_points', 'higher');
    if (!values || signal.comparisonKey !== 'subscription.discount') return null;
    const base = common(
      'subscription_discount',
      hypothesis,
      generatedAt,
      'subscription-higher-discount-v1',
    );
    return finish(
      base,
      { kind: 'current_subscription_discount', discountPercent: values.owned },
      {
        kind: 'configurable_higher_subscription_discount',
        discountPercent: { status: 'requires_user_configuration' },
        constraint: 'higher_than_control',
        competitorReferenceDiscountPercent: values.competitor,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_promotional_incentives' &&
    signal.signalType === 'competitor_higher_explicit_percentage_discount'
  ) {
    const values = numericComparison(signal, 'percentage_points', 'higher');
    if (!values || signal.comparisonKey !== 'offer.discount.explicit_percentage') return null;
    const base = common(
      'explicit_discount',
      hypothesis,
      generatedAt,
      'promotion-higher-percentage-discount-v1',
    );
    return finish(
      base,
      {
        kind: 'owned_current_offer_state',
        comparisonKey: signal.comparisonKey,
        observedAmount: values.owned,
      },
      {
        kind: 'configurable_explicit_discount',
        discountKind: 'percentage',
        amount: { status: 'requires_user_configuration' },
        constraint: 'higher_than_control',
        competitorReferenceAmount: values.competitor,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_promotional_incentives' &&
    signal.signalType === 'competitor_offers_explicit_discount_owned_does_not'
  ) {
    const match = /^offer\.discount:(percentage|fixed):(\d+(?:\.\d+)?)$/.exec(signal.comparisonKey);
    if (
      !match ||
      signal.supportingValues.owned !== false ||
      signal.supportingValues.competitor !== true
    )
      return null;
    const reference = Number(match[2]);
    if (!Number.isFinite(reference) || reference < 0) return null;
    const base = common(
      'explicit_discount',
      hypothesis,
      generatedAt,
      'promotion-explicit-discount-presence-v1',
    );
    return finish(
      base,
      {
        kind: 'owned_current_offer_state',
        comparisonKey: signal.comparisonKey,
        observedAmount: null,
      },
      {
        kind: 'configurable_explicit_discount',
        discountKind: match[1],
        amount: { status: 'requires_user_configuration' },
        constraint: 'introduce_variant',
        competitorReferenceAmount: reference,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_promotional_incentives' &&
    signal.signalType === 'competitor_offers_bundle_owned_does_not'
  ) {
    if (
      signal.comparisonKey !== 'offer.bundle' ||
      signal.supportingValues.owned !== false ||
      signal.supportingValues.competitor !== true
    )
      return null;
    const base = common('bundle_offer', hypothesis, generatedAt, 'promotion-bundle-presence-v1');
    return finish(
      base,
      { kind: 'owned_current_bundle_state', present: false },
      {
        kind: 'configurable_bundle_definition',
        definition: { status: 'requires_user_configuration' },
        competitorReferencePresent: true,
      },
    );
  }

  if (
    hypothesis.hypothesisType === 'competitor_may_emphasize_promotional_incentives' &&
    signal.signalType === 'competitor_offers_bogo_owned_does_not'
  ) {
    if (
      signal.comparisonKey !== 'offer.buy_x_get_y' ||
      signal.supportingValues.owned !== false ||
      signal.supportingValues.competitor !== true
    )
      return null;
    const base = common('bogo_offer', hypothesis, generatedAt, 'promotion-bogo-presence-v1');
    return finish(
      base,
      { kind: 'owned_current_bogo_state', present: false },
      {
        kind: 'configurable_bogo_definition',
        definition: { status: 'requires_user_configuration' },
        competitorReferencePresent: true,
      },
    );
  }

  return null;
}

/** Generates definitions only from persisted hypotheses supplied by the accepted current projection. */
export function generateRecommendedExperiments(
  input: GenerateRecommendedExperimentsInput,
): RecommendedExperimentCandidate[] {
  const hypotheses = strategicHypothesisSchema.array().parse(input.currentHypotheses);
  const signals = competitiveSignalSchema.array().parse(input.supportingSignals);
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  const candidates: RecommendedExperimentCandidate[] = [];

  for (const hypothesis of hypotheses) {
    if (
      hypothesis.hypothesisEngineVersion !== SUPPORTED_EXPERIMENT_HYPOTHESIS_ENGINE_VERSION ||
      hypothesis.hypothesisType ===
        'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives'
    )
      continue;

    const linkedSignals = hypothesis.supportingSignalIds.map((id) => signalsById.get(id));
    if (linkedSignals.some((signal) => !signal)) {
      throw new Error('Recommended experiment generation requires every linked supporting signal.');
    }
    if (
      linkedSignals.some(
        (signal) =>
          signal!.ownedBrandId !== hypothesis.ownedBrandId ||
          signal!.competitorId !== hypothesis.competitorId,
      )
    ) {
      throw new Error('Recommended experiment generation received mismatched hypothesis lineage.');
    }

    const byType = new Map<RecommendedExperimentType, RecommendedExperimentCandidate>();
    const orderedSignals = [...linkedSignals] as CompetitiveSignal[];
    orderedSignals.sort((left, right) => {
      const numericDiscountRank = (signal: CompetitiveSignal) =>
        signal.signalType === 'competitor_higher_explicit_percentage_discount' ? 0 : 1;
      return (
        numericDiscountRank(left) - numericDiscountRank(right) || left.id.localeCompare(right.id)
      );
    });
    for (const signal of orderedSignals) {
      const candidate = buildForSignal(hypothesis, signal, input.generatedAt);
      if (candidate && !byType.has(candidate.experimentType))
        byType.set(candidate.experimentType, candidate);
    }
    candidates.push(...byType.values());
  }

  return candidates.sort(
    (left, right) =>
      left.ownedBrandId.localeCompare(right.ownedBrandId) ||
      left.competitorId.localeCompare(right.competitorId) ||
      left.experimentType.localeCompare(right.experimentType) ||
      left.experimentHash.localeCompare(right.experimentHash),
  );
}
