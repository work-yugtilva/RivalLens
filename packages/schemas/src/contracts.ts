import { z } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const sha256Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const confidenceSchema = z.number().min(0).max(1);

export const aiProvenanceSchema = z.object({
  modelProvider: z.string().min(1),
  modelName: z.string().min(1),
  promptVersion: z.string().min(1),
  analysisVersion: z.string().min(1),
});

export const connectorHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unavailable']),
  checkedAt: timestamp,
  reason: z.string().min(1).optional(),
});

export const discoveredSourceSchema = z.object({
  connectorType: z.string().min(1),
  sourceType: z.string().min(1),
  canonicalUrl: z.string().url(),
  externalId: z.string().min(1).optional(),
});

export const websiteRefreshRequestSchema = z.object({
  subjectType: z.enum(['brand', 'competitor']),
  subjectId: uuid,
});

/** Discovery uses the same authorized brand or competitor target as a refresh. */
export const websiteDiscoveryRequestSchema = websiteRefreshRequestSchema;

export const websiteCollectionRequestSchema = z.object({
  sourceId: uuid,
});

export const websitePageTypeSchema = z.enum([
  'homepage',
  'product',
  'collection',
  'pricing_offers',
  'about',
  'reviews_testimonials',
  'shipping_returns',
  'subscription',
  'unknown',
]);

export const websiteSourceSchema = z.object({
  id: uuid,
  brandId: uuid,
  competitorId: uuid.nullable(),
  connectorType: z.literal('website'),
  sourceType: websitePageTypeSchema,
  canonicalUrl: z.string().url(),
  status: z.enum(['active', 'failed']),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const discoverInputSchema = z.object({
  subjectId: uuid,
  canonicalUrl: z.string().url(),
});

export const snapshotSchema = z.object({
  id: uuid,
  sourceId: uuid,
  capturedAt: timestamp,
  contentHash: z.string().min(1),
  rawArtifactPath: z.string().min(1).optional(),
  normalizedArtifactPath: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Collector output before the application assigns a source or snapshot ID. */
export const rawSnapshotSchema = z.object({
  connectorType: z.string().min(1),
  sourceType: z.string().min(1),
  canonicalUrl: z.string().url(),
  externalId: z.string().min(1).optional(),
  capturedAt: timestamp,
  contentHash: z.string().min(1).optional(),
  content: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const websiteRawSnapshotSchema = rawSnapshotSchema.extend({
  connectorType: z.literal('website'),
  sourceType: websitePageTypeSchema,
  contentHash: sha256Hash,
  rawContentHash: sha256Hash,
  content: z.object({
    html: z.string().min(1),
    rawBodyBase64: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }),
  metadata: z.object({
    requestedUrl: z.string().url(),
    finalUrl: z.string().url(),
    redirects: z.array(z.string().url()).max(6),
    httpStatus: z.number().int().min(100).max(599),
    contentType: z.enum(['text/html', 'application/xhtml+xml']),
    charset: z.string().min(1),
    byteLength: z.number().int().nonnegative(),
    collectorVersion: z.string().min(1),
    normalizerVersion: z.string().min(1),
  }),
});

export const websiteSnapshotSchema = snapshotSchema.extend({
  finalUrl: z.string().url(),
  httpStatus: z.number().int().min(100).max(599),
  contentType: z.enum(['text/html', 'application/xhtml+xml']),
  rawContentHash: sha256Hash,
  contentHash: sha256Hash,
  rawArtifactPath: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
});

export const observationSchema = z.object({
  id: uuid,
  snapshotId: uuid,
  subjectId: uuid,
  factType: z.string().min(1),
  observedAt: timestamp,
  payload: z.record(z.string(), z.unknown()),
  confidence: confidenceSchema,
  extractorVersion: z.string().min(1),
});

export const extractionMethodSchema = z.enum(['json_ld', 'meta', 'dom']);

export const websiteObservationFactTypeSchema = z.enum([
  'product.name',
  'product.price',
  'product.availability',
  'offer.discount',
  'offer.promo',
  'offer.bundle',
  'offer.buy_x_get_y',
  'offer.free_shipping',
  'subscription.details',
  'policy.guarantee',
  'policy.return_window',
  'positioning.homepage',
]);

/** Normalizer output before the application persists the observation. */
export const observationCandidateSchema = z.object({
  factType: z.string().min(1),
  observedAt: timestamp,
  sourceUrl: z.string().url(),
  payload: z.record(z.string(), z.unknown()),
  extractionMethod: extractionMethodSchema,
  confidence: confidenceSchema,
  extractorVersion: z.string().min(1),
});

export const websiteObservationCandidateSchema = observationCandidateSchema.extend({
  factType: websiteObservationFactTypeSchema,
});


export const observedChangeTypeSchema = z.enum([
  'product.price.increased',
  'product.price.decreased',
  'product.price.compare_at_changed',
  'product.availability.changed',
  'offer.discount.added',
  'offer.discount.removed',
  'offer.discount.changed',
  'offer.promo.added',
  'offer.promo.removed',
  'offer.promo.changed',
  'offer.free_shipping.added',
  'offer.free_shipping.removed',
  'offer.free_shipping.threshold_changed',
  'offer.bundle.added',
  'offer.bundle.removed',
  'offer.bundle.changed',
  'offer.buy_x_get_y.added',
  'offer.buy_x_get_y.removed',
  'offer.buy_x_get_y.changed',
  'subscription.added',
  'subscription.removed',
  'subscription.discount.changed',
  'policy.guarantee.duration_changed',
  'policy.return_window.duration_changed',
  'positioning.homepage.headline_changed',
  'positioning.homepage.subheadline_changed',
  'positioning.homepage.primary_cta_changed',
]);

export const observedChangeSchema = z.object({
  id: uuid,
  subjectId: uuid,
  sourceId: uuid,
  factType: z.string().min(1),
  changeType: observedChangeTypeSchema,
  previousSnapshotId: uuid.nullable(),
  currentSnapshotId: uuid,
  previousObservationId: uuid.nullable(),
  currentObservationId: uuid.nullable(),
  factIdentity: z.string().min(1),
  beforeValue: z.record(z.string(), z.unknown()).nullable(),
  afterValue: z.record(z.string(), z.unknown()).nullable(),
  detectedAt: timestamp,
  detectorVersion: z.string().min(1),
  changeHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

/** Deterministic change output before the application persists the row. */
export const observedChangeCandidateSchema = observedChangeSchema.omit({ id: true });

export const comparisonFactStateSchema = z.enum(['present', 'explicitly_absent', 'unknown']);

export const comparisonProvenanceSchema = z.object({
  observationId: uuid.nullable(),
  snapshotId: uuid,
  priorObservationId: uuid.optional(),
  priorSnapshotId: uuid.optional(),
  sourceId: uuid,
  sourceUrl: z.string().url(),
  observedAt: timestamp,
  confidence: confidenceSchema,
});

export const comparisonSubjectValueSchema = z.object({
  state: comparisonFactStateSchema,
  value: z.record(z.string(), z.unknown()).nullable(),
  provenance: comparisonProvenanceSchema.nullable(),
});

export const comparisonNumericDeltaSchema = z.object({
  competitorSubjectId: uuid,
  ownedValue: z.number(),
  competitorValue: z.number(),
  difference: z.number(),
  unit: z.enum(['usd', 'days', 'percent']),
});

export const comparisonFactSchema = z.object({
  key: z.string().min(1),
  valuesBySubjectId: z.record(uuid, comparisonSubjectValueSchema),
  numericDeltas: z.array(comparisonNumericDeltaSchema).optional(),
});

export const comparisonSubjectSchema = z.object({
  subjectType: z.enum(['brand', 'competitor']),
  subjectId: uuid,
  domain: z.string().min(1),
});

export const comparisonProductSchema = z.object({
  productUrl: z.string().min(1),
  name: comparisonSubjectValueSchema.optional(),
  price: comparisonSubjectValueSchema.optional(),
  availability: comparisonSubjectValueSchema.optional(),
});

export const comparisonProductsBySubjectSchema = z.object({
  productCount: z.number().int().nonnegative(),
  products: z.array(comparisonProductSchema),
});

export const brandComparisonResultSchema = z.object({
  brandId: uuid,
  generatedAt: timestamp,
  ownedSubject: comparisonSubjectSchema,
  competitors: z.array(comparisonSubjectSchema),
  facts: z.array(comparisonFactSchema),
  productsBySubject: z.record(uuid, comparisonProductsBySubjectSchema),
});

export const brandComparisonRequestSchema = z.object({
  competitorIds: z.array(uuid).min(1).max(5),
});

export type ComparisonFactState = z.infer<typeof comparisonFactStateSchema>;
export type ComparisonProvenance = z.infer<typeof comparisonProvenanceSchema>;
export type ComparisonSubjectValue = z.infer<typeof comparisonSubjectValueSchema>;
export type ComparisonNumericDelta = z.infer<typeof comparisonNumericDeltaSchema>;
export type ComparisonFact = z.infer<typeof comparisonFactSchema>;
export type ComparisonSubject = z.infer<typeof comparisonSubjectSchema>;
export type ComparisonProduct = z.infer<typeof comparisonProductSchema>;
export type ComparisonProductsBySubject = z.infer<typeof comparisonProductsBySubjectSchema>;
export type BrandComparisonResult = z.infer<typeof brandComparisonResultSchema>;
export type BrandComparisonRequest = z.infer<typeof brandComparisonRequestSchema>;

export const competitiveSignalTypeSchema = z.enum([
  'competitor_lower_free_shipping_threshold',
  'competitor_higher_free_shipping_threshold',
  'competitor_longer_return_window',
  'competitor_shorter_return_window',
  'competitor_longer_guarantee_duration',
  'competitor_shorter_guarantee_duration',
  'competitor_offers_subscription_owned_does_not',
  'owned_offers_subscription_competitor_does_not',
  'competitor_higher_subscription_discount',
  'competitor_lower_subscription_discount',
  'competitor_higher_explicit_percentage_discount',
  'competitor_lower_explicit_percentage_discount',
  'competitor_offers_explicit_discount_owned_does_not',
  'owned_offers_explicit_discount_competitor_does_not',
  'competitor_offers_promotion_owned_does_not',
  'owned_offers_promotion_competitor_does_not',
  'competitor_offers_bundle_owned_does_not',
  'owned_offers_bundle_competitor_does_not',
  'competitor_offers_bogo_owned_does_not',
  'owned_offers_bogo_competitor_does_not',
  'positioning_differs',
  'competitor_lowered_free_shipping_threshold',
  'competitor_raised_free_shipping_threshold',
  'competitor_increased_explicit_percentage_discount',
  'competitor_decreased_explicit_percentage_discount',
  'competitor_added_subscription',
  'competitor_removed_subscription',
  'competitor_increased_subscription_discount',
  'competitor_decreased_subscription_discount',
  'competitor_extended_guarantee_duration',
  'competitor_shortened_guarantee_duration',
  'competitor_extended_return_window',
  'competitor_shortened_return_window',
  'competitor_changed_homepage_headline',
  'competitor_added_promotion',
  'competitor_removed_promotion',
]);

export const competitiveSignalDirectionSchema = z.enum([
  'competitor_lower',
  'competitor_higher',
  'different',
  'added',
  'removed',
]);

export const competitiveSignalConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const competitiveSignalEvidenceRoleSchema = z.enum([
  'owned',
  'competitor',
  'previous',
  'current',
  'evaluation',
  'previous_evaluation',
]);

export const competitiveSignalEvidenceReferenceSchema = z
  .object({
    role: competitiveSignalEvidenceRoleSchema,
    sourceId: uuid,
    snapshotId: uuid,
    observationId: uuid.nullable(),
    priorSnapshotId: uuid.optional(),
    priorObservationId: uuid.optional(),
    observedChangeId: uuid.optional(),
    confidence: confidenceSchema,
  })
  .strict()
  .superRefine((reference, context) => {
    if (
      (reference.role === 'previous' ||
        reference.role === 'current' ||
        reference.role === 'previous_evaluation') &&
      reference.observationId === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observationId'],
        message: `${reference.role} evidence requires an observation ID`,
      });
    }
    if (reference.role === 'evaluation' && reference.observationId !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observationId'],
        message: 'Evaluation evidence must be snapshot-backed',
      });
    }
    if (
      (reference.role === 'previous' ||
        reference.role === 'current' ||
        reference.role === 'evaluation' ||
        reference.role === 'previous_evaluation') &&
      reference.observedChangeId === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observedChangeId'],
        message: `${reference.role} evidence requires an observed change ID`,
      });
    }
  });

export const competitiveSignalSupportingValueSchema = z.union([
  z.string().min(1),
  z.number().finite(),
  z.boolean(),
]);

export const competitiveSignalSupportingValuesSchema = z
  .object({
    owned: competitiveSignalSupportingValueSchema.optional(),
    competitor: competitiveSignalSupportingValueSchema.optional(),
    previous: competitiveSignalSupportingValueSchema.optional(),
    current: competitiveSignalSupportingValueSchema.optional(),
    delta: z.number().finite().optional(),
    unit: z.enum(['usd', 'days', 'percent', 'percentage_points']).optional(),
  })
  .strict()
  .refine((values) => Object.keys(values).length > 0, {
    message: 'At least one supporting value is required',
  });

export const competitiveSignalCandidateSchema = z
  .object({
    signalType: competitiveSignalTypeSchema,
    ownedBrandId: uuid,
    competitorId: uuid,
    comparisonKey: z.string().min(1),
    statement: z.string().min(1),
    supportingValues: competitiveSignalSupportingValuesSchema,
    confidence: competitiveSignalConfidenceSchema,
    evidence: z.array(competitiveSignalEvidenceReferenceSchema).min(1),
    generatedAt: timestamp,
    ruleVersion: z.string().min(1),
    signalHash: sha256Hash,
    direction: competitiveSignalDirectionSchema.optional(),
  })
  .strict();

export const competitiveSignalSchema = competitiveSignalCandidateSchema.extend({ id: uuid });

export const currentCompetitiveSignalFamilySchema = z.enum([
  'relative_numeric',
  'presence_difference',
  'positioning_difference',
]);

export const currentCompetitiveSignalLogicalIdentitySchema = z
  .object({
    ownedBrandId: uuid,
    competitorId: uuid,
    comparisonKey: z.string().min(1),
    signalFamily: currentCompetitiveSignalFamilySchema,
  })
  .strict();

export const currentCompetitiveSignalUnresolvedSchema = z
  .object({
    logicalIdentity: currentCompetitiveSignalLogicalIdentitySchema,
    state: z.literal('unknown'),
  })
  .strict();

export const currentCompetitiveSignalsProjectionSchema = z
  .object({
    ruleVersion: z.string().min(1),
    signals: z.array(competitiveSignalCandidateSchema),
    unresolved: z.array(currentCompetitiveSignalUnresolvedSchema),
  })
  .strict();

export const strategicHypothesisTypeSchema = z.enum([
  'competitor_may_reduce_shipping_friction',
  'competitor_may_reduce_perceived_purchase_risk',
  'competitor_may_emphasize_repeat_purchase_mechanics',
  'competitor_may_emphasize_promotional_incentives',
  'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives',
]);

export const strategicHypothesisUncertaintyCategorySchema = z.enum([
  'conversion_effect_not_established',
  'retention_effect_not_established',
  'promotion_impact_not_established',
  'combined_business_impact_not_established',
]);

export const strategicHypothesisUncertaintySchema = z
  .object({
    category: strategicHypothesisUncertaintyCategorySchema,
    statement: z.string().min(1),
  })
  .strict();

export const strategicHypothesisGenerationProvenanceSchema = z
  .object({
    method: z.literal('deterministic_template'),
    templateId: strategicHypothesisTypeSchema,
    sourceSignalRuleVersion: z.literal('competitive-signals-v1'),
  })
  .strict();

const historicalStrategicHypothesisGenerationProvenanceSchema = z
  .object({
    method: z.literal('deterministic_template'),
    templateId: strategicHypothesisTypeSchema,
    sourceSignalRuleVersion: z.string().min(1),
  })
  .strict();

export const STRATEGIC_HYPOTHESIS_CANONICAL_COPY = {
  competitor_may_reduce_shipping_friction: {
    statement:
      'The competitor may be using a lower free-shipping threshold to reduce purchase friction.',
    rationale:
      "A current competitive signal shows that the competitor's free-shipping threshold is lower than the owned brand's.",
    uncertainty: {
      category: 'conversion_effect_not_established',
      statement: 'Public evidence does not establish whether this improves conversion.',
    },
  },
  competitor_may_reduce_perceived_purchase_risk: {
    statement:
      'The competitor may be using a more permissive post-purchase policy to reduce perceived purchase risk.',
    rationale:
      'Current competitive signals show a longer return window or guarantee than the owned brand offers.',
    uncertainty: {
      category: 'conversion_effect_not_established',
      statement: 'Public evidence does not establish whether this improves conversion.',
    },
  },
  competitor_may_emphasize_repeat_purchase_mechanics: {
    statement: 'The competitor may be emphasizing repeat-purchase mechanics.',
    rationale:
      'Current competitive signals show subscription availability that the owned brand lacks or a larger explicit subscription discount.',
    uncertainty: {
      category: 'retention_effect_not_established',
      statement:
        'Public evidence does not establish whether this improves retention or lifetime value.',
    },
  },
  competitor_may_emphasize_promotional_incentives: {
    statement: 'The competitor may be leaning more heavily on promotional incentives.',
    rationale:
      'Current competitive signals show explicit promotional mechanics that the owned brand lacks or a larger explicit percentage discount.',
    uncertainty: {
      category: 'promotion_impact_not_established',
      statement: 'This indicates a promotional difference, not its business impact.',
    },
  },
  competitor_may_combine_purchase_friction_and_repeat_purchase_incentives: {
    statement:
      'The competitor may be using several purchase-friction and repeat-purchase incentives simultaneously.',
    rationale:
      'Current competitive signals jointly show a lower free-shipping threshold, a longer return or guarantee policy, and subscription-related mechanics.',
    uncertainty: {
      category: 'combined_business_impact_not_established',
      statement:
        'Public evidence does not establish conversion, retention, or other business impact.',
    },
  },
} as const satisfies Record<
  z.infer<typeof strategicHypothesisTypeSchema>,
  {
    statement: string;
    rationale: string;
    uncertainty: z.infer<typeof strategicHypothesisUncertaintySchema>;
  }
>;

const strategicHypothesisObjectSchema = z
  .object({
    hypothesisType: strategicHypothesisTypeSchema,
    ownedBrandId: uuid,
    competitorId: uuid,
    statement: z.string().min(1),
    rationale: z.string().min(1),
    supportingSignalIds: z.array(uuid).min(1),
    confidence: z.enum(['medium', 'low']),
    uncertainty: strategicHypothesisUncertaintySchema,
    generatedAt: timestamp,
    hypothesisEngineVersion: z.string().min(1),
    generationProvenance: historicalStrategicHypothesisGenerationProvenanceSchema,
    hypothesisHash: sha256Hash,
  })
  .strict();

function refineStrategicHypothesis(
  hypothesis: z.infer<typeof strategicHypothesisObjectSchema>,
  context: z.RefinementCtx,
) {
  if (hypothesis.hypothesisEngineVersion === 'strategic-hypotheses-v1') {
    const copy = STRATEGIC_HYPOTHESIS_CANONICAL_COPY[hypothesis.hypothesisType];
    if (hypothesis.statement !== copy.statement) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statement'],
        message: 'Hypothesis statement must match its deterministic template',
      });
    }
    if (hypothesis.rationale !== copy.rationale) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rationale'],
        message: 'Hypothesis rationale must match its deterministic template',
      });
    }
    if (
      hypothesis.uncertainty.category !== copy.uncertainty.category ||
      hypothesis.uncertainty.statement !== copy.uncertainty.statement
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uncertainty'],
        message: 'Hypothesis uncertainty must match its deterministic template',
      });
    }
  }
  if (hypothesis.generationProvenance.templateId !== hypothesis.hypothesisType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['generationProvenance', 'templateId'],
      message: 'Hypothesis template ID must match its hypothesis type',
    });
  }
  if (
    new Set(hypothesis.supportingSignalIds).size !== hypothesis.supportingSignalIds.length ||
    hypothesis.supportingSignalIds.some(
      (id, index) => index > 0 && id < hypothesis.supportingSignalIds[index - 1]!,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supportingSignalIds'],
      message: 'Supporting signal IDs must be unique and sorted',
    });
  }
}

export const strategicHypothesisCandidateSchema = strategicHypothesisObjectSchema
  .extend({
    hypothesisEngineVersion: z.literal('strategic-hypotheses-v1'),
    generationProvenance: strategicHypothesisGenerationProvenanceSchema,
  })
  .strict()
  .superRefine(refineStrategicHypothesis);

export const strategicHypothesisSchema = strategicHypothesisObjectSchema
  .extend({ id: uuid })
  .strict()
  .superRefine(refineStrategicHypothesis);

export const currentStrategicHypothesisLogicalIdentitySchema = z
  .object({
    ownedBrandId: uuid,
    competitorId: uuid,
    hypothesisType: strategicHypothesisTypeSchema,
  })
  .strict();

function currentCompetitiveSignalIdentityKey(
  identity: z.infer<typeof currentCompetitiveSignalLogicalIdentitySchema>,
): string {
  return [
    identity.ownedBrandId,
    identity.competitorId,
    identity.comparisonKey,
    identity.signalFamily,
  ].join(':');
}

function sortedUniqueCurrentSignalDependencies(
  dependencies: z.infer<typeof currentCompetitiveSignalLogicalIdentitySchema>[],
): boolean {
  return dependencies.every(
    (dependency, index) =>
      index === 0 ||
      currentCompetitiveSignalIdentityKey(dependencies[index - 1]!) <
        currentCompetitiveSignalIdentityKey(dependency),
  );
}

export const currentStrategicHypothesisUnresolvedSchema = z
  .object({
    logicalIdentity: currentStrategicHypothesisLogicalIdentitySchema,
    state: z.literal('unknown'),
    unresolvedSignalDependencies: z
      .array(currentCompetitiveSignalLogicalIdentitySchema)
      .min(1),
  })
  .strict()
  .refine(
    (value) => sortedUniqueCurrentSignalDependencies(value.unresolvedSignalDependencies),
    {
      message: 'Unresolved signal dependencies must be unique and sorted',
      path: ['unresolvedSignalDependencies'],
    },
  );

export const currentStrategicHypothesisGenerationNeededSchema = z
  .object({
    logicalIdentity: currentStrategicHypothesisLogicalIdentitySchema,
    supportingSignalIds: z.array(uuid).min(1),
    candidateHypothesisHash: sha256Hash,
    hypothesisEngineVersion: z.literal('strategic-hypotheses-v1'),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.supportingSignalIds).size === value.supportingSignalIds.length &&
      value.supportingSignalIds.every(
        (id, index) => index === 0 || value.supportingSignalIds[index - 1]! < id,
      ),
    {
      message: 'Supporting signal IDs must be unique and sorted',
      path: ['supportingSignalIds'],
    },
  );

export const currentStrategicHypothesesProjectionSchema = z
  .object({
    hypothesisEngineVersion: z.literal('strategic-hypotheses-v1'),
    hypotheses: z.array(strategicHypothesisSchema),
    unresolved: z.array(currentStrategicHypothesisUnresolvedSchema),
    generationNeeded: z.array(currentStrategicHypothesisGenerationNeededSchema),
  })
  .strict();

export const recommendedExperimentTypeSchema = z.enum([
  'free_shipping_threshold',
  'return_window_policy',
  'guarantee_policy',
  'subscription_availability',
  'subscription_discount',
  'explicit_discount',
  'bundle_offer',
  'bogo_offer',
]);

export const experimentMetricNameSchema = z.enum([
  'conversion_rate',
  'checkout_conversion_rate',
  'average_order_value',
  'contribution_margin_per_order',
  'shipping_cost_per_order',
  'return_rate',
  'refund_rate',
  'subscription_take_rate',
  'subscription_cancellation_rate',
]);

export const experimentMetricSchema = z
  .object({
    metric: experimentMetricNameSchema,
    measurementReadiness: z.enum(['available', 'requires_first_party_data']),
  })
  .strict();

export const experimentDesignSchema = z
  .object({
    comparison: z.literal('control_vs_treatment'),
    variablePolicy: z.literal('single_variable'),
    heldConstant: z.literal('all_non_target_experience_elements'),
  })
  .strict();

export const experimentDurationPlanningSchema = z
  .object({
    status: z.literal('requires_first_party_data'),
    requiredInputs: z.tuple([
      z.literal('baseline_primary_metric'),
      z.literal('eligible_traffic'),
      z.literal('minimum_detectable_effect'),
      z.literal('significance_level'),
      z.literal('statistical_power'),
    ]),
  })
  .strict();

export const experimentConfidenceSchema = z
  .object({
    level: z.enum(['medium', 'low']),
    basis: z.literal('support_for_testing_rationale'),
  })
  .strict();

export const experimentCaveatSchema = z
  .object({
    category: z.enum([
      'shipping_margin_exposure',
      'policy_return_refund_exposure',
      'subscription_customer_fit_and_cancellation',
      'promotion_margin_exposure',
    ]),
    statement: z.string().min(1),
  })
  .strict();

export const experimentGenerationProvenanceSchema = z
  .object({
    method: z.literal('deterministic_rule'),
    eligibilityRuleId: z.string().min(1),
    templateId: recommendedExperimentTypeSchema,
    sourceHypothesisEngineVersion: z.string().min(1),
  })
  .strict();

const configurableNumberSchema = z
  .object({ status: z.literal('requires_user_configuration') })
  .strict();

const recommendedExperimentCommonShape = {
  ownedBrandId: uuid,
  competitorId: uuid,
  sourceHypothesisIds: z.array(uuid).min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  hypothesisUnderTest: z.string().min(1),
  design: experimentDesignSchema,
  primaryMetric: experimentMetricSchema,
  guardrailMetrics: z.array(experimentMetricSchema).min(1),
  durationPlanning: experimentDurationPlanningSchema,
  implementationNotes: z.array(z.string().min(1)).min(1),
  confidence: experimentConfidenceSchema,
  caveat: experimentCaveatSchema,
  generatedAt: timestamp,
  experimentEngineVersion: z.string().min(1),
  generationProvenance: experimentGenerationProvenanceSchema,
  experimentHash: sha256Hash,
};

const freeShippingThresholdExperimentSchema = z
  .object({
    ...recommendedExperimentCommonShape,
    experimentType: z.literal('free_shipping_threshold'),
    control: z
      .object({
        kind: z.literal('current_free_shipping_threshold'),
        thresholdUsd: z.number().finite().nonnegative(),
      })
      .strict(),
    treatment: z
      .object({
        kind: z.literal('configurable_lower_free_shipping_threshold'),
        thresholdUsd: configurableNumberSchema,
        constraint: z.literal('lower_than_control'),
        competitorReferenceThresholdUsd: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

function policyExperimentSchema(type: 'return_window_policy' | 'guarantee_policy') {
  return z
    .object({
      ...recommendedExperimentCommonShape,
      experimentType: z.literal(type),
      control: z
        .object({
          kind: z.literal(
            type === 'return_window_policy' ? 'current_return_window' : 'current_guarantee',
          ),
          durationDays: z.number().finite().nonnegative(),
        })
        .strict(),
      treatment: z
        .object({
          kind: z.literal(
            type === 'return_window_policy'
              ? 'configurable_longer_return_window'
              : 'configurable_longer_guarantee',
          ),
          durationDays: configurableNumberSchema,
          constraint: z.literal('longer_than_control'),
          competitorReferenceDurationDays: z.number().finite().nonnegative(),
          operationalReviewRequired: z.literal(true),
        })
        .strict(),
    })
    .strict();
}

const returnWindowExperimentSchema = policyExperimentSchema('return_window_policy');
const guaranteeExperimentSchema = policyExperimentSchema('guarantee_policy');

const subscriptionAvailabilityExperimentSchema = z
  .object({
    ...recommendedExperimentCommonShape,
    experimentType: z.literal('subscription_availability'),
    control: z.object({ kind: z.literal('current_one_time_purchase_only') }).strict(),
    treatment: z
      .object({
        kind: z.literal('visible_subscribe_and_save_option'),
        discountPercent: configurableNumberSchema,
        competitorReferenceAvailable: z.literal(true),
      })
      .strict(),
  })
  .strict();

const subscriptionDiscountExperimentSchema = z
  .object({
    ...recommendedExperimentCommonShape,
    experimentType: z.literal('subscription_discount'),
    control: z
      .object({
        kind: z.literal('current_subscription_discount'),
        discountPercent: z.number().finite().nonnegative(),
      })
      .strict(),
    treatment: z
      .object({
        kind: z.literal('configurable_higher_subscription_discount'),
        discountPercent: configurableNumberSchema,
        constraint: z.literal('higher_than_control'),
        competitorReferenceDiscountPercent: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

const explicitDiscountExperimentSchema = z
  .object({
    ...recommendedExperimentCommonShape,
    experimentType: z.literal('explicit_discount'),
    control: z
      .object({
        kind: z.literal('owned_current_offer_state'),
        comparisonKey: z.string().min(1),
        observedAmount: z.number().finite().nonnegative().nullable(),
      })
      .strict(),
    treatment: z
      .object({
        kind: z.literal('configurable_explicit_discount'),
        discountKind: z.enum(['percentage', 'fixed']),
        amount: configurableNumberSchema,
        constraint: z.enum(['introduce_variant', 'higher_than_control']),
        competitorReferenceAmount: z.number().finite().nonnegative(),
      })
      .strict(),
  })
  .strict();

function presenceOfferExperimentSchema(type: 'bundle_offer' | 'bogo_offer') {
  return z
    .object({
      ...recommendedExperimentCommonShape,
      experimentType: z.literal(type),
      control: z
        .object({
          kind: z.literal(
            type === 'bundle_offer' ? 'owned_current_bundle_state' : 'owned_current_bogo_state',
          ),
          present: z.literal(false),
        })
        .strict(),
      treatment: z
        .object({
          kind: z.literal(
            type === 'bundle_offer'
              ? 'configurable_bundle_definition'
              : 'configurable_bogo_definition',
          ),
          definition: z.object({ status: z.literal('requires_user_configuration') }).strict(),
          competitorReferencePresent: z.literal(true),
        })
        .strict(),
    })
    .strict();
}

const bundleOfferExperimentSchema = presenceOfferExperimentSchema('bundle_offer');
const bogoOfferExperimentSchema = presenceOfferExperimentSchema('bogo_offer');

const recommendedExperimentVariantSchemas = [
  freeShippingThresholdExperimentSchema,
  returnWindowExperimentSchema,
  guaranteeExperimentSchema,
  subscriptionAvailabilityExperimentSchema,
  subscriptionDiscountExperimentSchema,
  explicitDiscountExperimentSchema,
  bundleOfferExperimentSchema,
  bogoOfferExperimentSchema,
] as const;

export const RECOMMENDED_EXPERIMENT_CANONICAL_COPY = {
  free_shipping_threshold: {
    title: 'Test a lower free-shipping threshold',
    objective:
      'Test the current shipping-friction hypothesis with one controlled threshold variant.',
    hypothesisUnderTest:
      'Evaluate whether a safely selected lower free-shipping threshold performs differently from the current threshold on checkout conversion while respecting margin and shipping-cost guardrails.',
    caveat: {
      category: 'shipping_margin_exposure',
      statement:
        'Lower thresholds may increase shipping subsidy and should be evaluated against margin guardrails.',
    },
  },
  return_window_policy: {
    title: 'Test a longer return-window variant',
    objective:
      'Test the current perceived-risk hypothesis with one controlled return-window variant.',
    hypothesisUnderTest:
      'Evaluate whether a user-configured longer return window performs differently from the current policy on purchase conversion while monitoring return, refund, and margin exposure.',
    caveat: {
      category: 'policy_return_refund_exposure',
      statement: 'More permissive policies may increase return or refund exposure.',
    },
  },
  guarantee_policy: {
    title: 'Test a longer guarantee variant',
    objective: 'Test the current perceived-risk hypothesis with one controlled guarantee variant.',
    hypothesisUnderTest:
      'Evaluate whether a user-configured longer guarantee performs differently from the current policy on purchase conversion while monitoring return, refund, and margin exposure.',
    caveat: {
      category: 'policy_return_refund_exposure',
      statement: 'More permissive policies may increase return or refund exposure.',
    },
  },
  subscription_availability: {
    title: 'Test a visible subscribe-and-save option',
    objective:
      'Test the current repeat-purchase hypothesis with one controlled subscription-availability variant.',
    hypothesisUnderTest:
      'Evaluate how a visible subscribe-and-save option compares with the current one-time-purchase-only experience on eligible product pages.',
    caveat: {
      category: 'subscription_customer_fit_and_cancellation',
      statement:
        'Subscription mechanics should be evaluated for customer fit and cancellation behavior.',
    },
  },
  subscription_discount: {
    title: 'Test a subscription-discount variant',
    objective:
      'Test the current repeat-purchase hypothesis with one controlled subscription-discount variant.',
    hypothesisUnderTest:
      'Evaluate how a user-configured higher subscription discount compares with the current discount while placement and eligibility remain unchanged.',
    caveat: {
      category: 'subscription_customer_fit_and_cancellation',
      statement:
        'Subscription mechanics should be evaluated for customer fit and cancellation behavior.',
    },
  },
  explicit_discount: {
    title: 'Test an explicit discount variant',
    objective:
      'Test the current promotional-incentive hypothesis with one controlled explicit-discount variant.',
    hypothesisUnderTest:
      "Evaluate how one user-configured explicit discount variant compares with the owned brand's current offer state while monitoring margin.",
    caveat: {
      category: 'promotion_margin_exposure',
      statement: 'Discount tests may affect conversion while reducing contribution margin.',
    },
  },
  bundle_offer: {
    title: 'Test a bundle-offer variant',
    objective:
      'Test the current promotional-incentive hypothesis with one controlled bundle variant.',
    hypothesisUnderTest:
      "Evaluate how one user-configured bundle offer compares with the owned brand's current offer state while monitoring margin.",
    caveat: {
      category: 'promotion_margin_exposure',
      statement: 'Promotional tests may affect conversion while reducing contribution margin.',
    },
  },
  bogo_offer: {
    title: 'Test a BOGO-offer variant',
    objective:
      'Test the current promotional-incentive hypothesis with one controlled BOGO variant.',
    hypothesisUnderTest:
      "Evaluate how one user-configured BOGO offer compares with the owned brand's current offer state while monitoring margin.",
    caveat: {
      category: 'promotion_margin_exposure',
      statement: 'Promotional tests may affect conversion while reducing contribution margin.',
    },
  },
} as const;

function refineRecommendedExperiment(
  experiment: z.infer<(typeof recommendedExperimentVariantSchemas)[number]>,
  context: z.RefinementCtx,
) {
  const copy = RECOMMENDED_EXPERIMENT_CANONICAL_COPY[experiment.experimentType];
  if (experiment.experimentEngineVersion === 'recommended-experiments-v1') {
    if (
      experiment.title !== copy.title ||
      experiment.objective !== copy.objective ||
      experiment.hypothesisUnderTest !== copy.hypothesisUnderTest
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'Experiment wording must match its deterministic template',
      });
    }
    if (
      experiment.caveat.category !== copy.caveat.category ||
      experiment.caveat.statement !== copy.caveat.statement
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['caveat'],
        message: 'Experiment caveat must match its deterministic template',
      });
    }
  }
  if (experiment.generationProvenance.templateId !== experiment.experimentType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['generationProvenance', 'templateId'],
      message: 'Experiment template ID must match its type',
    });
  }
  if (
    new Set(experiment.sourceHypothesisIds).size !== experiment.sourceHypothesisIds.length ||
    experiment.sourceHypothesisIds.some(
      (id, index) => index > 0 && id <= experiment.sourceHypothesisIds[index - 1]!,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceHypothesisIds'],
      message: 'Source hypothesis IDs must be unique and sorted',
    });
  }
  const guardrails = experiment.guardrailMetrics.map(({ metric }) => metric);
  if (
    new Set(guardrails).size !== guardrails.length ||
    guardrails.includes(experiment.primaryMetric.metric)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guardrailMetrics'],
      message: 'Guardrail metrics must be unique and distinct from the primary metric',
    });
  }
}

export const recommendedExperimentCandidateSchema = z
  .discriminatedUnion('experimentType', recommendedExperimentVariantSchemas)
  .superRefine(refineRecommendedExperiment);

const persistedRecommendedExperimentVariantSchemas = [
  freeShippingThresholdExperimentSchema.extend({ id: uuid }).strict(),
  returnWindowExperimentSchema.extend({ id: uuid }).strict(),
  guaranteeExperimentSchema.extend({ id: uuid }).strict(),
  subscriptionAvailabilityExperimentSchema.extend({ id: uuid }).strict(),
  subscriptionDiscountExperimentSchema.extend({ id: uuid }).strict(),
  explicitDiscountExperimentSchema.extend({ id: uuid }).strict(),
  bundleOfferExperimentSchema.extend({ id: uuid }).strict(),
  bogoOfferExperimentSchema.extend({ id: uuid }).strict(),
] as const;

export const recommendedExperimentSchema = z
  .discriminatedUnion('experimentType', persistedRecommendedExperimentVariantSchemas)
  .superRefine(refineRecommendedExperiment);

/** Compatibility alias for consumers that previously imported the generic signal contract. */
export const signalSchema = competitiveSignalSchema;

export const reportClaimSchema = z.object({
  text: z.string().min(1),
  confidence: confidenceSchema,
  evidenceIds: z.array(uuid).min(1),
  signalIds: z.array(uuid).default([]),
});

export const reportSchema = z.object({
  id: uuid,
  brandId: uuid,
  revision: z.number().int().positive(),
  generatedAt: timestamp,
  evidenceRevision: z.string().min(1),
  advantages: z.array(reportClaimSchema),
  competitorAdvantages: z.array(reportClaimSchema),
  workingPatterns: z.array(reportClaimSchema),
  recommendedTests: z.array(reportClaimSchema),
  aiProvenance: aiProvenanceSchema.optional(),
});

export type ConnectorHealth = z.infer<typeof connectorHealthSchema>;
export type DiscoveredSource = z.infer<typeof discoveredSourceSchema>;
export type DiscoverInput = z.infer<typeof discoverInputSchema>;
export type WebsiteRefreshRequest = z.infer<typeof websiteRefreshRequestSchema>;
export type WebsiteDiscoveryRequest = z.infer<typeof websiteDiscoveryRequestSchema>;
export type WebsiteCollectionRequest = z.infer<typeof websiteCollectionRequestSchema>;
export type WebsitePageType = z.infer<typeof websitePageTypeSchema>;
export type WebsiteSource = z.infer<typeof websiteSourceSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type RawSnapshot = z.infer<typeof rawSnapshotSchema>;
export type WebsiteRawSnapshot = z.infer<typeof websiteRawSnapshotSchema>;
export type WebsiteSnapshot = z.infer<typeof websiteSnapshotSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type ObservationCandidate = z.infer<typeof observationCandidateSchema>;
export type WebsiteObservationCandidate = z.infer<typeof websiteObservationCandidateSchema>;
export type ObservedChangeType = z.infer<typeof observedChangeTypeSchema>;
export type ObservedChange = z.infer<typeof observedChangeSchema>;
export type ObservedChangeCandidate = z.infer<typeof observedChangeCandidateSchema>;
export type CompetitiveSignalType = z.infer<typeof competitiveSignalTypeSchema>;
export type CompetitiveSignalDirection = z.infer<typeof competitiveSignalDirectionSchema>;
export type CompetitiveSignalConfidence = z.infer<typeof competitiveSignalConfidenceSchema>;
export type CompetitiveSignalEvidenceRole = z.infer<typeof competitiveSignalEvidenceRoleSchema>;
export type CompetitiveSignalEvidenceReference = z.infer<
  typeof competitiveSignalEvidenceReferenceSchema
>;
export type CompetitiveSignalSupportingValue = z.infer<
  typeof competitiveSignalSupportingValueSchema
>;
export type CompetitiveSignalSupportingValues = z.infer<
  typeof competitiveSignalSupportingValuesSchema
>;
export type CompetitiveSignalCandidate = z.infer<typeof competitiveSignalCandidateSchema>;
export type CompetitiveSignal = z.infer<typeof competitiveSignalSchema>;
export type CurrentCompetitiveSignalFamily = z.infer<typeof currentCompetitiveSignalFamilySchema>;
export type CurrentCompetitiveSignalLogicalIdentity = z.infer<
  typeof currentCompetitiveSignalLogicalIdentitySchema
>;
export type CurrentCompetitiveSignalUnresolved = z.infer<
  typeof currentCompetitiveSignalUnresolvedSchema
>;
export type CurrentCompetitiveSignalsProjection = z.infer<
  typeof currentCompetitiveSignalsProjectionSchema
>;
export type StrategicHypothesisType = z.infer<typeof strategicHypothesisTypeSchema>;
export type StrategicHypothesisUncertaintyCategory = z.infer<
  typeof strategicHypothesisUncertaintyCategorySchema
>;
export type StrategicHypothesisUncertainty = z.infer<typeof strategicHypothesisUncertaintySchema>;
export type StrategicHypothesisGenerationProvenance = z.infer<
  typeof strategicHypothesisGenerationProvenanceSchema
>;
export type StrategicHypothesisCandidate = z.infer<typeof strategicHypothesisCandidateSchema>;
export type StrategicHypothesis = z.infer<typeof strategicHypothesisSchema>;
export type CurrentStrategicHypothesisLogicalIdentity = z.infer<
  typeof currentStrategicHypothesisLogicalIdentitySchema
>;
export type CurrentStrategicHypothesisUnresolved = z.infer<
  typeof currentStrategicHypothesisUnresolvedSchema
>;
export type CurrentStrategicHypothesisGenerationNeeded = z.infer<
  typeof currentStrategicHypothesisGenerationNeededSchema
>;
export type CurrentStrategicHypothesesProjection = z.infer<
  typeof currentStrategicHypothesesProjectionSchema
>;
export type RecommendedExperimentType = z.infer<typeof recommendedExperimentTypeSchema>;
export type ExperimentMetricName = z.infer<typeof experimentMetricNameSchema>;
export type ExperimentMetric = z.infer<typeof experimentMetricSchema>;
export type RecommendedExperimentCandidate = z.infer<typeof recommendedExperimentCandidateSchema>;
export type RecommendedExperiment = z.infer<typeof recommendedExperimentSchema>;
export type Signal = CompetitiveSignal;
export type Report = z.infer<typeof reportSchema>;
