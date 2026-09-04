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
export type Signal = CompetitiveSignal;
export type Report = z.infer<typeof reportSchema>;
