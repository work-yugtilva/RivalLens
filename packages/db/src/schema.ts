import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizationRoleValues = ['owner', 'admin', 'member'] as const;

export const competitiveSignalTypeValues = [
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
] as const;

export const competitiveSignalConfidenceValues = ['high', 'medium', 'low'] as const;
export const competitiveSignalDirectionValues = [
  'competitor_lower',
  'competitor_higher',
  'different',
  'added',
  'removed',
] as const;
export const competitiveSignalEvidenceRoleValues = [
  'owned',
  'competitor',
  'previous',
  'previous_evaluation',
  'current',
  'evaluation',
] as const;

export const strategicHypothesisTypeValues = [
  'competitor_may_reduce_shipping_friction',
  'competitor_may_reduce_perceived_purchase_risk',
  'competitor_may_emphasize_repeat_purchase_mechanics',
  'competitor_may_emphasize_promotional_incentives',
  'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives',
] as const;
export const strategicHypothesisConfidenceValues = ['medium', 'low'] as const;
export const strategicHypothesisUncertaintyCategoryValues = [
  'conversion_effect_not_established',
  'retention_effect_not_established',
  'promotion_impact_not_established',
  'combined_business_impact_not_established',
] as const;

export const recommendedExperimentTypeValues = [
  'free_shipping_threshold',
  'return_window_policy',
  'guarantee_policy',
  'subscription_availability',
  'subscription_discount',
  'explicit_discount',
  'bundle_offer',
  'bogo_offer',
] as const;
export const recommendedExperimentCaveatCategoryValues = [
  'shipping_margin_exposure',
  'policy_return_refund_exposure',
  'subscription_customer_fit_and_cancellation',
  'promotion_margin_exposure',
] as const;

export const intelligenceGenerationOutcomeValues = [
  'llm_success',
  'llm_partial',
  'llm_rejected',
  'deterministic_fallback',
] as const;
export const intelligenceFallbackReasonValues = [
  'CONTEXT_HASH_MISMATCH',
  'INVALID_CONTEXT',
  'MALFORMED_OUTPUT',
  'VALIDATION_REPAIR_EXHAUSTED',
  'PROVIDER_RETRY_EXHAUSTED',
  'PROVIDER_NON_RETRYABLE_FAILURE',
] as const;
export const intelligenceValidationStatusValues = ['passed', 'partial', 'failed'] as const;
export const intelligenceProviderFailureValues = [
  'timeout',
  'rate_limit',
  'provider_unavailable',
  'authentication_configuration',
  'invalid_request',
  'provider_exception',
] as const;
export const analysisObjectiveValues = [
  'general_overview',
  'pricing_focus',
  'friction_reduction',
  'retention',
  'promotions',
] as const;
export const llmStrategicHypothesisThemeValues = [
  'shipping_friction',
  'purchase_risk_reduction',
  'repeat_purchase_mechanics',
  'promotional_incentives',
  'pricing_strategy',
  'bundle_packaging',
] as const;
export const experimentMetricValues = [
  'conversion_rate',
  'checkout_conversion_rate',
  'average_order_value',
  'contribution_margin_per_order',
  'shipping_cost_per_order',
  'return_rate',
  'refund_rate',
  'subscription_take_rate',
  'subscription_cancellation_rate',
] as const;

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role', { enum: organizationRoleValues }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    category: text('category'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('brands_organization_id_idx').on(table.organizationId),
    unique('brands_organization_id_domain_key').on(table.organizationId, table.domain),
  ],
);

export const competitors = pgTable(
  'competitors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('competitors_brand_id_idx').on(table.brandId),
    unique('competitors_brand_id_domain_key').on(table.brandId, table.domain),
    unique('competitors_id_brand_id_key').on(table.id, table.brandId),
  ],
);

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id'),
    connectorType: text('connector_type').notNull(),
    sourceType: text('source_type').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    externalId: text('external_id'),
    status: text('status', { enum: ['active', 'failed'] }).notNull().default('active'),
    lastCollectedAt: timestamp('last_collected_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sources_brand_id_idx').on(table.brandId),
    index('sources_competitor_id_idx').on(table.competitorId).where(sql`${table.competitorId} is not null`),
    unique('sources_brand_id_competitor_id_connector_type_canonical_url_key')
      .on(table.brandId, table.competitorId, table.connectorType, table.canonicalUrl)
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.competitorId, table.brandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'sources_competitor_matches_brand_fk',
    }),
    check('sources_connector_type_not_blank', sql`char_length(trim(${table.connectorType})) between 1 and 80`),
    check('sources_source_type_not_blank', sql`char_length(trim(${table.sourceType})) between 1 and 80`),
    check('sources_canonical_url_http', sql`${table.canonicalUrl} ~ '^https?://'`),
  ],
);

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    finalUrl: text('final_url').notNull(),
    httpStatus: smallint('http_status').notNull(),
    contentType: text('content_type', { enum: ['text/html', 'application/xhtml+xml'] }).notNull(),
    rawContentHash: text('raw_content_hash').notNull(),
    contentHash: text('content_hash').notNull(),
    rawArtifactPath: text('raw_artifact_path').notNull(),
    normalizedArtifactPath: text('normalized_artifact_path'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('snapshots_source_id_captured_at_idx').on(table.sourceId, table.capturedAt.desc()),
    check('snapshots_final_url_http', sql`${table.finalUrl} ~ '^https?://'`),
    check('snapshots_http_status_range', sql`${table.httpStatus} between 100 and 599`),
    check('snapshots_content_type_allowed', sql`${table.contentType} in ('text/html', 'application/xhtml+xml')`),
    check('snapshots_raw_content_hash_sha256', sql`${table.rawContentHash} ~ '^sha256:[0-9a-f]{64}$'`),
    check('snapshots_content_hash_sha256', sql`${table.contentHash} ~ '^sha256:[0-9a-f]{64}$'`),
  ],
);

export const observations = pgTable(
  'observations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'restrict' }),
    subjectId: uuid('subject_id').notNull(),
    factType: text('fact_type').notNull(),
    sourceUrl: text('source_url').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    extractionMethod: text('extraction_method', { enum: ['json_ld', 'meta', 'dom'] }).notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    extractorVersion: text('extractor_version').notNull(),
    candidateHash: text('candidate_hash').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('observations_snapshot_id_idx').on(table.snapshotId),
    index('observations_subject_id_observed_at_idx').on(table.subjectId, table.observedAt.desc()),
    unique('observations_snapshot_id_candidate_hash_key').on(table.snapshotId, table.candidateHash),
    check('observations_fact_type_not_blank', sql`char_length(trim(${table.factType})) between 1 and 120`),
    check('observations_source_url_http', sql`${table.sourceUrl} ~ '^https?://'`),
    check('observations_extraction_method_allowed', sql`${table.extractionMethod} in ('json_ld', 'meta', 'dom')`),
    check('observations_confidence_range', sql`${table.confidence} between 0 and 1`),
    check('observations_extractor_version_not_blank', sql`char_length(trim(${table.extractorVersion})) between 1 and 120`),
    check('observations_candidate_hash_sha256', sql`${table.candidateHash} ~ '^sha256:[0-9a-f]{64}$'`),
  ],
);

export const observedChanges = pgTable(
  'observed_changes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectId: uuid('subject_id').notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    factType: text('fact_type').notNull(),
    changeType: text('change_type').notNull(),
    factIdentity: text('fact_identity').notNull(),
    previousSnapshotId: uuid('previous_snapshot_id').references(() => snapshots.id, { onDelete: 'restrict' }),
    currentSnapshotId: uuid('current_snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'restrict' }),
    previousObservationId: uuid('previous_observation_id').references(() => observations.id, { onDelete: 'restrict' }),
    currentObservationId: uuid('current_observation_id').references(() => observations.id, { onDelete: 'restrict' }),
    beforeValue: jsonb('before_value').$type<Record<string, unknown>>(),
    afterValue: jsonb('after_value').$type<Record<string, unknown>>(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    detectorVersion: text('detector_version').notNull(),
    changeHash: text('change_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('observed_changes_subject_id_detected_at_idx').on(table.subjectId, table.detectedAt.desc()),
    index('observed_changes_source_id_detected_at_idx').on(table.sourceId, table.detectedAt.desc()),
    index('observed_changes_current_snapshot_id_idx').on(table.currentSnapshotId),
    unique('observed_changes_current_snapshot_id_change_hash_key').on(table.currentSnapshotId, table.changeHash),
    check('observed_changes_fact_type_not_blank', sql`char_length(trim(${table.factType})) between 1 and 120`),
    check('observed_changes_change_type_not_blank', sql`char_length(trim(${table.changeType})) between 1 and 120`),
    check('observed_changes_fact_identity_not_blank', sql`char_length(trim(${table.factIdentity})) between 1 and 500`),
    check('observed_changes_detector_version_not_blank', sql`char_length(trim(${table.detectorVersion})) between 1 and 120`),
    check('observed_changes_change_hash_sha256', sql`${table.changeHash} ~ '^sha256:[0-9a-f]{64}$'`),
  ],
);

export const competitiveSignals = pgTable(
  'competitive_signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id').notNull(),
    signalType: text('signal_type', { enum: competitiveSignalTypeValues }).notNull(),
    comparisonKey: text('comparison_key').notNull(),
    statement: text('statement').notNull(),
    supportingValues: jsonb('supporting_values')
      .$type<Record<string, string | number | boolean>>()
      .notNull(),
    confidence: text('confidence', { enum: competitiveSignalConfidenceValues }).notNull(),
    direction: text('direction', { enum: competitiveSignalDirectionValues }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    ruleVersion: text('rule_version').notNull(),
    signalHash: text('signal_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('competitive_signals_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    index('competitive_signals_competitor_id_generated_at_idx')
      .on(table.competitorId, table.generatedAt.desc())
      .where(sql`${table.competitorId} is not null`),
    unique('competitive_signals_owned_brand_id_signal_hash_key').on(
      table.ownedBrandId,
      table.signalHash,
    ),
    foreignKey({
      columns: [table.competitorId, table.ownedBrandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'competitive_signals_competitor_matches_brand_fk',
    }),
    check(
      'competitive_signals_signal_type_allowed',
      sql`${table.signalType} in (
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
        'competitor_removed_promotion'
      )`,
    ),
    check(
      'competitive_signals_comparison_key_not_blank',
      sql`char_length(trim(${table.comparisonKey})) > 0`,
    ),
    check(
      'competitive_signals_statement_not_blank',
      sql`char_length(trim(${table.statement})) > 0`,
    ),
    check(
      'competitive_signals_supporting_values_object',
      sql`jsonb_typeof(${table.supportingValues}) = 'object' and ${table.supportingValues} <> '{}'::jsonb`,
    ),
    check(
      'competitive_signals_confidence_allowed',
      sql`${table.confidence} in ('high', 'medium', 'low')`,
    ),
    check(
      'competitive_signals_direction_allowed',
      sql`${table.direction} in ('competitor_lower', 'competitor_higher', 'different', 'added', 'removed')`,
    ),
    check(
      'competitive_signals_rule_version_not_blank',
      sql`char_length(trim(${table.ruleVersion})) > 0`,
    ),
    check(
      'competitive_signals_signal_hash_sha256',
      sql`${table.signalHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const competitiveSignalEvidence = pgTable(
  'competitive_signal_evidence',
  {
    signalId: uuid('signal_id')
      .notNull()
      .references(() => competitiveSignals.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    role: text('role', { enum: competitiveSignalEvidenceRoleValues }).notNull(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'restrict' }),
    observationId: uuid('observation_id').references(() => observations.id, {
      onDelete: 'restrict',
    }),
    priorSnapshotId: uuid('prior_snapshot_id').references(() => snapshots.id, {
      onDelete: 'restrict',
    }),
    priorObservationId: uuid('prior_observation_id').references(() => observations.id, {
      onDelete: 'restrict',
    }),
    observedChangeId: uuid('observed_change_id').references(() => observedChanges.id, {
      onDelete: 'restrict',
    }),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.signalId, table.position] }),
    index('competitive_signal_evidence_source_id_idx').on(table.sourceId),
    index('competitive_signal_evidence_snapshot_id_idx').on(table.snapshotId),
    index('competitive_signal_evidence_observation_id_idx')
      .on(table.observationId)
      .where(sql`${table.observationId} is not null`),
    index('competitive_signal_evidence_prior_snapshot_id_idx')
      .on(table.priorSnapshotId)
      .where(sql`${table.priorSnapshotId} is not null`),
    index('competitive_signal_evidence_prior_observation_id_idx')
      .on(table.priorObservationId)
      .where(sql`${table.priorObservationId} is not null`),
    index('competitive_signal_evidence_observed_change_id_idx')
      .on(table.observedChangeId)
      .where(sql`${table.observedChangeId} is not null`),
    check('competitive_signal_evidence_position_nonnegative', sql`${table.position} >= 0`),
    check(
      'competitive_signal_evidence_role_allowed',
      sql`${table.role} in ('owned', 'competitor', 'previous', 'previous_evaluation', 'current', 'evaluation')`,
    ),
    check(
      'competitive_signal_evidence_confidence_range',
      sql`${table.confidence} between 0 and 1`,
    ),
    check(
      'competitive_signal_evidence_change_roles_have_observation',
      sql`${table.role} not in ('previous', 'previous_evaluation', 'current') or ${table.observationId} is not null`,
    ),
    check(
      'competitive_signal_evidence_evaluation_has_no_observation',
      sql`${table.role} <> 'evaluation' or ${table.observationId} is null`,
    ),
    check(
      'competitive_signal_evidence_temporal_roles_have_observed_change',
      sql`${table.role} not in ('previous', 'previous_evaluation', 'current', 'evaluation') or ${table.observedChangeId} is not null`,
    ),
  ],
);

export const strategicHypotheses = pgTable(
  'strategic_hypotheses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id').notNull(),
    hypothesisType: text('hypothesis_type', { enum: strategicHypothesisTypeValues }).notNull(),
    statement: text('statement').notNull(),
    rationale: text('rationale').notNull(),
    confidence: text('confidence', { enum: strategicHypothesisConfidenceValues }).notNull(),
    uncertaintyCategory: text('uncertainty_category', {
      enum: strategicHypothesisUncertaintyCategoryValues,
    }).notNull(),
    uncertaintyStatement: text('uncertainty_statement').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    hypothesisEngineVersion: text('hypothesis_engine_version').notNull(),
    generationProvenance: jsonb('generation_provenance')
      .$type<{
        method: 'deterministic_template';
        templateId: string;
        sourceSignalRuleVersion: string;
      }>()
      .notNull(),
    hypothesisHash: text('hypothesis_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('strategic_hypotheses_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    index('strategic_hypotheses_competitor_id_generated_at_idx').on(
      table.competitorId,
      table.generatedAt.desc(),
    ),
    unique('strategic_hypotheses_owned_brand_id_hypothesis_hash_key').on(
      table.ownedBrandId,
      table.hypothesisHash,
    ),
    foreignKey({
      columns: [table.competitorId, table.ownedBrandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'strategic_hypotheses_competitor_matches_brand_fk',
    }),
    check(
      'strategic_hypotheses_hypothesis_type_allowed',
      sql`${table.hypothesisType} in (
        'competitor_may_reduce_shipping_friction',
        'competitor_may_reduce_perceived_purchase_risk',
        'competitor_may_emphasize_repeat_purchase_mechanics',
        'competitor_may_emphasize_promotional_incentives',
        'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives'
      )`,
    ),
    check(
      'strategic_hypotheses_statement_not_blank',
      sql`char_length(trim(${table.statement})) > 0`,
    ),
    check(
      'strategic_hypotheses_rationale_not_blank',
      sql`char_length(trim(${table.rationale})) > 0`,
    ),
    check(
      'strategic_hypotheses_confidence_allowed',
      sql`${table.confidence} in ('medium', 'low')`,
    ),
    check(
      'strategic_hypotheses_uncertainty_category_allowed',
      sql`${table.uncertaintyCategory} in (
        'conversion_effect_not_established',
        'retention_effect_not_established',
        'promotion_impact_not_established',
        'combined_business_impact_not_established'
      )`,
    ),
    check(
      'strategic_hypotheses_uncertainty_statement_not_blank',
      sql`char_length(trim(${table.uncertaintyStatement})) > 0`,
    ),
    check(
      'strategic_hypotheses_hypothesis_engine_version_not_blank',
      sql`char_length(trim(${table.hypothesisEngineVersion})) > 0`,
    ),
    check(
      'strategic_hypotheses_generation_provenance_valid',
      sql`jsonb_typeof(${table.generationProvenance}) = 'object'
        and ${table.generationProvenance} ?& array['method', 'templateId', 'sourceSignalRuleVersion']
        and ${table.generationProvenance} - 'method' - 'templateId' - 'sourceSignalRuleVersion' = '{}'::jsonb
        and ${table.generationProvenance} ->> 'method' = 'deterministic_template'
        and char_length(trim(${table.generationProvenance} ->> 'templateId')) > 0
        and char_length(trim(${table.generationProvenance} ->> 'sourceSignalRuleVersion')) > 0`,
    ),
    check(
      'strategic_hypotheses_hypothesis_hash_sha256',
      sql`${table.hypothesisHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const strategicHypothesisSignals = pgTable(
  'strategic_hypothesis_signals',
  {
    hypothesisId: uuid('hypothesis_id')
      .notNull()
      .references(() => strategicHypotheses.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => competitiveSignals.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.hypothesisId, table.position] }),
    unique('strategic_hypothesis_signals_hypothesis_id_signal_id_key').on(
      table.hypothesisId,
      table.signalId,
    ),
    index('strategic_hypothesis_signals_signal_id_idx').on(table.signalId),
    check('strategic_hypothesis_signals_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

export const recommendedExperiments = pgTable(
  'recommended_experiments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id').notNull(),
    experimentType: text('experiment_type', { enum: recommendedExperimentTypeValues }).notNull(),
    title: text('title').notNull(),
    objective: text('objective').notNull(),
    hypothesisUnderTest: text('hypothesis_under_test').notNull(),
    design: jsonb('design').$type<Record<string, unknown>>().notNull(),
    controlConfiguration: jsonb('control_configuration').$type<Record<string, unknown>>().notNull(),
    treatmentConfiguration: jsonb('treatment_configuration')
      .$type<Record<string, unknown>>()
      .notNull(),
    primaryMetric: jsonb('primary_metric').$type<Record<string, unknown>>().notNull(),
    guardrailMetrics: jsonb('guardrail_metrics').$type<Array<Record<string, unknown>>>().notNull(),
    durationPlanning: jsonb('duration_planning').$type<Record<string, unknown>>().notNull(),
    implementationNotes: jsonb('implementation_notes').$type<string[]>().notNull(),
    confidenceLevel: text('confidence_level', {
      enum: strategicHypothesisConfidenceValues,
    }).notNull(),
    confidenceBasis: text('confidence_basis').notNull(),
    caveatCategory: text('caveat_category', {
      enum: recommendedExperimentCaveatCategoryValues,
    }).notNull(),
    caveatStatement: text('caveat_statement').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    experimentEngineVersion: text('experiment_engine_version').notNull(),
    generationProvenance: jsonb('generation_provenance')
      .$type<{
        method: 'deterministic_rule';
        eligibilityRuleId: string;
        templateId: string;
        sourceHypothesisEngineVersion: string;
      }>()
      .notNull(),
    experimentHash: text('experiment_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('recommended_experiments_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    index('recommended_experiments_competitor_id_generated_at_idx').on(
      table.competitorId,
      table.generatedAt.desc(),
    ),
    unique('recommended_experiments_owned_brand_id_experiment_hash_key').on(
      table.ownedBrandId,
      table.experimentHash,
    ),
    foreignKey({
      columns: [table.competitorId, table.ownedBrandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'recommended_experiments_competitor_matches_brand_fk',
    }),
    check(
      'recommended_experiments_experiment_type_allowed',
      sql`${table.experimentType} in ('free_shipping_threshold', 'return_window_policy', 'guarantee_policy', 'subscription_availability', 'subscription_discount', 'explicit_discount', 'bundle_offer', 'bogo_offer')`,
    ),
    check('recommended_experiments_title_not_blank', sql`char_length(trim(${table.title})) > 0`),
    check(
      'recommended_experiments_objective_not_blank',
      sql`char_length(trim(${table.objective})) > 0`,
    ),
    check(
      'recommended_experiments_hypothesis_under_test_not_blank',
      sql`char_length(trim(${table.hypothesisUnderTest})) > 0`,
    ),
    check('recommended_experiments_design_object', sql`jsonb_typeof(${table.design}) = 'object'`),
    check(
      'recommended_experiments_control_object',
      sql`jsonb_typeof(${table.controlConfiguration}) = 'object'`,
    ),
    check(
      'recommended_experiments_treatment_object',
      sql`jsonb_typeof(${table.treatmentConfiguration}) = 'object'`,
    ),
    check(
      'recommended_experiments_primary_metric_object',
      sql`jsonb_typeof(${table.primaryMetric}) = 'object'`,
    ),
    check(
      'recommended_experiments_guardrail_metrics_array',
      sql`jsonb_typeof(${table.guardrailMetrics}) = 'array' and jsonb_array_length(${table.guardrailMetrics}) > 0`,
    ),
    check(
      'recommended_experiments_duration_planning_object',
      sql`jsonb_typeof(${table.durationPlanning}) = 'object'`,
    ),
    check(
      'recommended_experiments_implementation_notes_array',
      sql`jsonb_typeof(${table.implementationNotes}) = 'array' and jsonb_array_length(${table.implementationNotes}) > 0`,
    ),
    check(
      'recommended_experiments_confidence_level_allowed',
      sql`${table.confidenceLevel} in ('medium', 'low')`,
    ),
    check(
      'recommended_experiments_confidence_basis_allowed',
      sql`${table.confidenceBasis} = 'support_for_testing_rationale'`,
    ),
    check(
      'recommended_experiments_caveat_category_allowed',
      sql`${table.caveatCategory} in ('shipping_margin_exposure', 'policy_return_refund_exposure', 'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure')`,
    ),
    check(
      'recommended_experiments_caveat_statement_not_blank',
      sql`char_length(trim(${table.caveatStatement})) > 0`,
    ),
    check(
      'recommended_experiments_engine_version_not_blank',
      sql`char_length(trim(${table.experimentEngineVersion})) > 0`,
    ),
    check(
      'recommended_experiments_provenance_object',
      sql`jsonb_typeof(${table.generationProvenance}) = 'object'`,
    ),
    check(
      'recommended_experiments_hash_sha256',
      sql`${table.experimentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const recommendedExperimentHypotheses = pgTable(
  'recommended_experiment_hypotheses',
  {
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => recommendedExperiments.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    hypothesisId: uuid('hypothesis_id')
      .notNull()
      .references(() => strategicHypotheses.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.experimentId, table.position] }),
    unique('recommended_experiment_hypotheses_experiment_id_hypothesis_id_key').on(
      table.experimentId,
      table.hypothesisId,
    ),
    index('recommended_experiment_hypotheses_hypothesis_id_idx').on(table.hypothesisId),
    check('recommended_experiment_hypotheses_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

export const competitiveIntelligenceReports = pgTable(
  'competitive_intelligence_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorIds: uuid('competitor_ids').array().notNull(),
    reportEngineVersion: text('report_engine_version').notNull(),
    reportHash: text('report_hash').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    generationRunId: uuid('generation_run_id').references(() => intelligenceGenerationRuns.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('competitive_intelligence_reports_generation_run_id_idx')
      .on(table.generationRunId)
      .where(sql`${table.generationRunId} is not null`),
    index('competitive_intelligence_reports_latest_scope_idx').on(
      table.ownedBrandId,
      table.competitorIds,
      table.generatedAt.desc(),
      table.id.desc(),
    ),
    unique('competitive_intelligence_reports_owned_brand_id_report_hash_key').on(
      table.ownedBrandId,
      table.reportHash,
    ),
    check(
      'competitive_intelligence_reports_competitor_count',
      sql`cardinality(${table.competitorIds}) between 1 and 5`,
    ),
    check(
      'competitive_intelligence_reports_engine_version',
      sql`char_length(trim(${table.reportEngineVersion})) > 0`,
    ),
    check(
      'competitive_intelligence_reports_report_hash_sha256',
      sql`${table.reportHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      'competitive_intelligence_reports_payload_valid',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload} ?& array[
          'brandId', 'generatedAt', 'reportEngineVersion', 'reportHash', 'sourceStateHash',
          'competitors', 'sourceIntelligence', 'completeness', 'sections'
        ]
        and ${table.payload} - 'brandId' - 'generatedAt' - 'reportEngineVersion' - 'reportHash'
          - 'sourceStateHash' - 'competitors' - 'sourceIntelligence' - 'completeness' - 'sections'
          = '{}'::jsonb
        and (${table.payload} ->> 'brandId')::uuid = ${table.ownedBrandId}
        and (${table.payload} ->> 'generatedAt')::timestamptz = ${table.generatedAt}
        and ${table.payload} ->> 'reportEngineVersion' = ${table.reportEngineVersion}
        and ${table.payload} ->> 'reportHash' = ${table.reportHash}
        and ${table.payload} ->> 'sourceStateHash' ~ '^sha256:[0-9a-f]{64}$'
        and jsonb_typeof(${table.payload} -> 'competitors') = 'array'
        and jsonb_typeof(${table.payload} -> 'sourceIntelligence') = 'object'
        and jsonb_typeof(${table.payload} -> 'completeness') = 'object'
        and jsonb_typeof(${table.payload} -> 'sections') = 'object'
        and (${table.payload} -> 'sections') ?& array[
          'yourAdvantages', 'competitorAdvantages', 'appearsToBeWorking', 'whatToTestNext'
        ]
        and (${table.payload} -> 'sections') - 'yourAdvantages' - 'competitorAdvantages'
          - 'appearsToBeWorking' - 'whatToTestNext' = '{}'::jsonb
        and jsonb_typeof(${table.payload} #> '{sections,yourAdvantages}') = 'array'
        and jsonb_array_length(${table.payload} #> '{sections,yourAdvantages}') <= 3
        and jsonb_typeof(${table.payload} #> '{sections,competitorAdvantages}') = 'array'
        and jsonb_array_length(${table.payload} #> '{sections,competitorAdvantages}') <= 3
        and jsonb_typeof(${table.payload} #> '{sections,appearsToBeWorking}') = 'array'
        and jsonb_array_length(${table.payload} #> '{sections,appearsToBeWorking}') <= 3
        and jsonb_typeof(${table.payload} #> '{sections,whatToTestNext}') = 'array'
        and jsonb_array_length(${table.payload} #> '{sections,whatToTestNext}') <= 3`,
    ),
  ],
);

const metricList = sql.raw(experimentMetricValues.map((metric) => `'${metric}'`).join(', '));

// Service-only audit record of one LLM generation run. Holds the exact frozen context and is
// never readable by authenticated clients (RLS enabled, no policies, no grants).
export const intelligenceGenerationRuns = pgTable(
  'intelligence_generation_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorIds: uuid('competitor_ids').array().notNull(),
    analysisObjective: text('analysis_objective', { enum: analysisObjectiveValues }).notNull(),
    contextVersion: text('context_version').notNull(),
    intelligenceContext: jsonb('intelligence_context').$type<Record<string, unknown>>().notNull(),
    intelligenceContextHash: text('intelligence_context_hash').notNull(),
    contextGeneratedAt: timestamp('context_generated_at', { withTimezone: true }).notNull(),
    promptVersion: text('prompt_version').notNull(),
    validatorContractVersion: text('validator_contract_version').notNull(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    modelParameters: jsonb('model_parameters').$type<Record<string, unknown>>().notNull(),
    outcome: text('outcome', { enum: intelligenceGenerationOutcomeValues }).notNull(),
    fallbackReason: text('fallback_reason', { enum: intelligenceFallbackReasonValues }),
    validationStatus: text('validation_status', { enum: intelligenceValidationStatusValues }),
    validationSummary: jsonb('validation_summary').$type<Record<string, unknown>>(),
    acceptedHypothesisCount: integer('accepted_hypothesis_count').notNull(),
    acceptedExperimentCount: integer('accepted_experiment_count').notNull(),
    executiveBriefingAccepted: boolean('executive_briefing_accepted').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('intelligence_generation_runs_owned_brand_id_created_at_idx').on(
      table.ownedBrandId,
      table.createdAt.desc(),
    ),
    check(
      'intelligence_generation_runs_competitor_count',
      sql`cardinality(${table.competitorIds}) between 1 and 5`,
    ),
    check(
      'intelligence_generation_runs_analysis_objective_allowed',
      sql`${table.analysisObjective} in ('general_overview', 'pricing_focus', 'friction_reduction', 'retention', 'promotions')`,
    ),
    check(
      'intelligence_generation_runs_context_version_not_blank',
      sql`char_length(trim(${table.contextVersion})) > 0`,
    ),
    check(
      'intelligence_generation_runs_context_hash_sha256',
      sql`${table.intelligenceContextHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      'intelligence_generation_runs_prompt_version_not_blank',
      sql`char_length(trim(${table.promptVersion})) > 0`,
    ),
    check(
      'intelligence_generation_runs_validator_contract_version_not_blank',
      sql`char_length(trim(${table.validatorContractVersion})) > 0`,
    ),
    check(
      'intelligence_generation_runs_provider_id_not_blank',
      sql`char_length(trim(${table.providerId})) > 0`,
    ),
    check(
      'intelligence_generation_runs_model_id_not_blank',
      sql`char_length(trim(${table.modelId})) > 0`,
    ),
    check(
      'intelligence_generation_runs_model_parameters_valid',
      sql`jsonb_typeof(${table.modelParameters}) = 'object'
        and ${table.modelParameters} - 'temperature' - 'maxOutputTokens' - 'reasoningEffort' = '{}'::jsonb`,
    ),
    check(
      'intelligence_generation_runs_outcome_allowed',
      sql`${table.outcome} in ('llm_success', 'llm_partial', 'llm_rejected', 'deterministic_fallback')`,
    ),
    check(
      'intelligence_generation_runs_fallback_reason_allowed',
      sql`${table.fallbackReason} in ('CONTEXT_HASH_MISMATCH', 'INVALID_CONTEXT', 'MALFORMED_OUTPUT', 'VALIDATION_REPAIR_EXHAUSTED', 'PROVIDER_RETRY_EXHAUSTED', 'PROVIDER_NON_RETRYABLE_FAILURE')`,
    ),
    check(
      'intelligence_generation_runs_validation_status_allowed',
      sql`${table.validationStatus} in ('passed', 'partial', 'failed')`,
    ),
    check(
      'intelligence_generation_runs_accepted_hypothesis_count_nonnegative',
      sql`${table.acceptedHypothesisCount} >= 0`,
    ),
    check(
      'intelligence_generation_runs_accepted_experiment_count_nonnegative',
      sql`${table.acceptedExperimentCount} >= 0`,
    ),
    check(
      'intelligence_generation_runs_context_matches_columns',
      sql`jsonb_typeof(${table.intelligenceContext}) = 'object'
        and (${table.intelligenceContext} #>> '{brand,id}')::uuid = ${table.ownedBrandId}
        and ${table.intelligenceContext} ->> 'contextVersion' = ${table.contextVersion}
        and ${table.intelligenceContext} ->> 'analysisObjective' = ${table.analysisObjective}
        and (${table.intelligenceContext} ->> 'generatedAt')::timestamptz = ${table.contextGeneratedAt}`,
    ),
    check(
      'intelligence_generation_runs_fallback_reason_matches_outcome',
      sql`(${table.outcome} = 'deterministic_fallback') = (${table.fallbackReason} is not null)`,
    ),
    check(
      'intelligence_generation_runs_validation_matches_outcome',
      sql`(${table.outcome} = 'llm_success' and ${table.validationStatus} = 'passed')
        or (${table.outcome} = 'llm_partial' and ${table.validationStatus} = 'partial')
        or (${table.outcome} = 'llm_rejected' and ${table.validationStatus} = 'failed')
        or ${table.outcome} = 'deterministic_fallback'`,
    ),
    check(
      'intelligence_generation_runs_validation_summary_valid',
      sql`(${table.validationStatus} is null) = (${table.validationSummary} is null)
        and (
          ${table.validationSummary} is null
          or (
            jsonb_typeof(${table.validationSummary}) = 'object'
            and ${table.validationSummary} ->> 'status' = ${table.validationStatus}
          )
        )`,
    ),
    check(
      'intelligence_generation_runs_accepted_items_match_outcome',
      sql`case
        when ${table.outcome} in ('llm_success', 'llm_partial') then
          ${table.acceptedHypothesisCount} + ${table.acceptedExperimentCount}
            + (case when ${table.executiveBriefingAccepted} then 1 else 0 end) > 0
        else
          ${table.acceptedHypothesisCount} = 0
          and ${table.acceptedExperimentCount} = 0
          and not ${table.executiveBriefingAccepted}
      end`,
    ),
  ],
);

// Service-only audit record of each provider invocation, including untrusted raw output.
export const intelligenceGenerationAttempts = pgTable(
  'intelligence_generation_attempts',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => intelligenceGenerationRuns.id, { onDelete: 'restrict' }),
    attemptNumber: smallint('attempt_number').notNull(),
    kind: text('kind', { enum: ['initial', 'retry'] }).notNull(),
    retryReason: text('retry_reason', { enum: ['transport', 'validation_repair'] }),
    promptVersion: text('prompt_version').notNull(),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 14, scale: 6 }),
    rawResponseId: text('raw_response_id'),
    finishReason: text('finish_reason'),
    providerFailure: text('provider_failure', { enum: intelligenceProviderFailureValues }),
    providerFailureMetadata: jsonb('provider_failure_metadata').$type<Record<string, unknown>>(),
    rawOutputCaptured: boolean('raw_output_captured').notNull(),
    rawOutput: jsonb('raw_output').$type<unknown>(),
    validationStatus: text('validation_status', { enum: intelligenceValidationStatusValues }),
    validationErrorCodes: text('validation_error_codes').array().default(sql`'{}'`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.attemptNumber] }),
    check(
      'intelligence_generation_attempts_attempt_number_allowed',
      sql`${table.attemptNumber} in (1, 2)`,
    ),
    check('intelligence_generation_attempts_kind_allowed', sql`${table.kind} in ('initial', 'retry')`),
    check(
      'intelligence_generation_attempts_retry_reason_allowed',
      sql`${table.retryReason} in ('transport', 'validation_repair')`,
    ),
    check(
      'intelligence_generation_attempts_prompt_version_not_blank',
      sql`char_length(trim(${table.promptVersion})) > 0`,
    ),
    check('intelligence_generation_attempts_latency_ms_nonnegative', sql`${table.latencyMs} >= 0`),
    check(
      'intelligence_generation_attempts_input_tokens_nonnegative',
      sql`${table.inputTokens} >= 0`,
    ),
    check(
      'intelligence_generation_attempts_output_tokens_nonnegative',
      sql`${table.outputTokens} >= 0`,
    ),
    check(
      'intelligence_generation_attempts_total_tokens_nonnegative',
      sql`${table.totalTokens} >= 0`,
    ),
    check(
      'intelligence_generation_attempts_estimated_cost_usd_nonnegative',
      sql`${table.estimatedCostUsd} >= 0`,
    ),
    check(
      'intelligence_generation_attempts_provider_failure_allowed',
      sql`${table.providerFailure} in ('timeout', 'rate_limit', 'provider_unavailable', 'authentication_configuration', 'invalid_request', 'provider_exception')`,
    ),
    check(
      'intelligence_generation_attempts_provider_failure_metadata_valid',
      sql`${table.providerFailureMetadata} is null
        or (
          jsonb_typeof(${table.providerFailureMetadata}) = 'object'
          and ${table.providerFailureMetadata} - 'httpStatus' - 'providerRequestId'
            - 'providerErrorCode' - 'fieldViolationPaths' = '{}'::jsonb
        )`,
    ),
    check(
      'intelligence_generation_attempts_validation_status_allowed',
      sql`${table.validationStatus} in ('passed', 'partial', 'failed')`,
    ),
    check(
      'intelligence_generation_attempts_kind_matches_number',
      sql`(${table.attemptNumber} = 1 and ${table.kind} = 'initial' and ${table.retryReason} is null)
        or (${table.attemptNumber} = 2 and ${table.kind} = 'retry' and ${table.retryReason} is not null)`,
    ),
    check(
      'intelligence_generation_attempts_failure_has_no_output',
      sql`${table.providerFailure} is null
        or (
          not ${table.rawOutputCaptured}
          and ${table.latencyMs} is null and ${table.inputTokens} is null and ${table.outputTokens} is null
          and ${table.totalTokens} is null and ${table.estimatedCostUsd} is null
          and ${table.rawResponseId} is null and ${table.finishReason} is null
        )`,
    ),
    check(
      'intelligence_generation_attempts_failure_metadata_requires_failure',
      sql`${table.providerFailure} is not null or ${table.providerFailureMetadata} is null`,
    ),
    check(
      'intelligence_generation_attempts_raw_output_capture_consistent',
      sql`(${table.rawOutputCaptured} or ${table.rawOutput} is null)
        and (${table.rawOutputCaptured} = (${table.validationStatus} is not null))
        and (${table.validationStatus} is not null or cardinality(${table.validationErrorCodes}) = 0)`,
    ),
  ],
);

const llmProvenanceCheck = (provenance: unknown, runId: unknown) =>
  sql`jsonb_typeof(${provenance}) = 'object'
    and ${provenance} ->> 'method' = 'llm_synthesized'
    and ${provenance} ->> 'generationRunId' = ${runId}::text`;

// Customer-facing, validator-accepted LLM strategic hypotheses.
export const llmStrategicHypotheses = pgTable(
  'llm_strategic_hypotheses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => intelligenceGenerationRuns.id, { onDelete: 'restrict' }),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id').notNull(),
    hypothesisRef: text('hypothesis_ref').notNull(),
    theme: text('theme', { enum: llmStrategicHypothesisThemeValues }).notNull(),
    statement: text('statement').notNull(),
    rationale: text('rationale').notNull(),
    confidence: text('confidence', { enum: strategicHypothesisConfidenceValues }).notNull(),
    uncertaintyCategory: text('uncertainty_category', {
      enum: strategicHypothesisUncertaintyCategoryValues,
    }).notNull(),
    uncertaintyStatement: text('uncertainty_statement').notNull(),
    assumptions: jsonb('assumptions').$type<string[]>().notNull(),
    epistemicClassDependencies: text('epistemic_class_dependencies').array().notNull(),
    supportingSignalIds: uuid('supporting_signal_ids').array().notNull(),
    supportingComparisonKeys: text('supporting_comparison_keys').array().notNull(),
    claimReferences: jsonb('claim_references').$type<Array<Record<string, unknown>>>().notNull(),
    numericClaims: jsonb('numeric_claims').$type<Array<Record<string, unknown>>>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    hypothesisEngineVersion: text('hypothesis_engine_version').notNull(),
    generationProvenance: jsonb('generation_provenance')
      .$type<Record<string, unknown>>()
      .notNull(),
    hypothesisHash: text('hypothesis_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('llm_strategic_hypotheses_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    foreignKey({
      columns: [table.competitorId, table.ownedBrandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'llm_strategic_hypotheses_competitor_matches_brand_fk',
    }),
    unique('llm_strategic_hypotheses_generation_run_id_hypothesis_ref_key').on(
      table.generationRunId,
      table.hypothesisRef,
    ),
    unique('llm_strategic_hypotheses_ref_identity_key').on(
      table.id,
      table.generationRunId,
      table.hypothesisRef,
    ),
    unique('llm_strategic_hypotheses_dependency_identity_key').on(
      table.id,
      table.generationRunId,
      table.hypothesisRef,
      table.competitorId,
    ),
    unique('llm_strategic_hypotheses_owned_brand_id_hypothesis_hash_key').on(
      table.ownedBrandId,
      table.hypothesisHash,
    ),
    check(
      'llm_strategic_hypotheses_hypothesis_ref_format',
      sql`${table.hypothesisRef} ~ '^h[1-9][0-9]*$'`,
    ),
    check(
      'llm_strategic_hypotheses_theme_allowed',
      sql`${table.theme} in ('shipping_friction', 'purchase_risk_reduction', 'repeat_purchase_mechanics', 'promotional_incentives', 'pricing_strategy', 'bundle_packaging')`,
    ),
    check(
      'llm_strategic_hypotheses_statement_not_blank',
      sql`char_length(trim(${table.statement})) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_rationale_not_blank',
      sql`char_length(trim(${table.rationale})) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_confidence_allowed',
      sql`${table.confidence} in ('medium', 'low')`,
    ),
    check(
      'llm_strategic_hypotheses_uncertainty_category_allowed',
      sql`${table.uncertaintyCategory} in ('conversion_effect_not_established', 'retention_effect_not_established', 'promotion_impact_not_established', 'combined_business_impact_not_established')`,
    ),
    check(
      'llm_strategic_hypotheses_uncertainty_statement_not_blank',
      sql`char_length(trim(${table.uncertaintyStatement})) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_assumptions_array',
      sql`jsonb_typeof(${table.assumptions}) = 'array' and jsonb_array_length(${table.assumptions}) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_epistemic_class_dependencies_valid',
      sql`cardinality(${table.epistemicClassDependencies}) > 0
        and ${table.epistemicClassDependencies} <@ array['observed', 'derived', 'estimated', 'reported']::text[]`,
    ),
    check(
      'llm_strategic_hypotheses_supporting_signal_ids_not_empty',
      sql`cardinality(${table.supportingSignalIds}) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_supporting_comparison_keys_not_empty',
      sql`cardinality(${table.supportingComparisonKeys}) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_claim_references_array',
      sql`jsonb_typeof(${table.claimReferences}) = 'array' and jsonb_array_length(${table.claimReferences}) > 0`,
    ),
    check(
      'llm_strategic_hypotheses_numeric_claims_array',
      sql`jsonb_typeof(${table.numericClaims}) = 'array'`,
    ),
    check(
      'llm_strategic_hypotheses_engine_version_allowed',
      sql`${table.hypothesisEngineVersion} = 'strategic-hypotheses-v2-llm'`,
    ),
    check(
      'llm_strategic_hypotheses_generation_provenance_valid',
      llmProvenanceCheck(table.generationProvenance, table.generationRunId),
    ),
    check(
      'llm_strategic_hypotheses_hypothesis_hash_sha256',
      sql`${table.hypothesisHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

export const llmStrategicHypothesisSignals = pgTable(
  'llm_strategic_hypothesis_signals',
  {
    hypothesisId: uuid('hypothesis_id')
      .notNull()
      .references(() => llmStrategicHypotheses.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    signalId: uuid('signal_id')
      .notNull()
      .references(() => competitiveSignals.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.hypothesisId, table.position] }),
    unique('llm_strategic_hypothesis_signals_hypothesis_id_signal_id_key').on(
      table.hypothesisId,
      table.signalId,
    ),
    index('llm_strategic_hypothesis_signals_signal_id_idx').on(table.signalId),
    check('llm_strategic_hypothesis_signals_position_nonnegative', sql`${table.position} >= 0`),
  ],
);

// Customer-facing, validator-accepted LLM experiments bound to an exact accepted hypothesis ref.
export const llmRecommendedExperiments = pgTable(
  'llm_recommended_experiments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => intelligenceGenerationRuns.id, { onDelete: 'restrict' }),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    competitorId: uuid('competitor_id').notNull(),
    hypothesisId: uuid('hypothesis_id').notNull(),
    sourceHypothesisRef: text('source_hypothesis_ref').notNull(),
    title: text('title').notNull(),
    objective: text('objective').notNull(),
    hypothesisUnderTest: text('hypothesis_under_test').notNull(),
    variableUnderTest: text('variable_under_test').notNull(),
    design: jsonb('design').$type<Record<string, unknown>>().notNull(),
    primaryMetric: text('primary_metric', { enum: experimentMetricValues }).notNull(),
    guardrailMetrics: text('guardrail_metrics').array().notNull(),
    implementationNotes: jsonb('implementation_notes').$type<string[]>().notNull(),
    caveatCategory: text('caveat_category', {
      enum: recommendedExperimentCaveatCategoryValues,
    }).notNull(),
    caveatStatement: text('caveat_statement').notNull(),
    claimReferences: jsonb('claim_references').$type<Array<Record<string, unknown>>>().notNull(),
    numericClaims: jsonb('numeric_claims').$type<Array<Record<string, unknown>>>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    experimentEngineVersion: text('experiment_engine_version').notNull(),
    generationProvenance: jsonb('generation_provenance')
      .$type<Record<string, unknown>>()
      .notNull(),
    experimentHash: text('experiment_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('llm_recommended_experiments_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    index('llm_recommended_experiments_generation_run_id_idx').on(table.generationRunId),
    index('llm_recommended_experiments_hypothesis_id_idx').on(table.hypothesisId),
    foreignKey({
      columns: [table.competitorId, table.ownedBrandId],
      foreignColumns: [competitors.id, competitors.brandId],
      name: 'llm_recommended_experiments_competitor_matches_brand_fk',
    }),
    foreignKey({
      columns: [
        table.hypothesisId,
        table.generationRunId,
        table.sourceHypothesisRef,
        table.competitorId,
      ],
      foreignColumns: [
        llmStrategicHypotheses.id,
        llmStrategicHypotheses.generationRunId,
        llmStrategicHypotheses.hypothesisRef,
        llmStrategicHypotheses.competitorId,
      ],
      name: 'llm_recommended_experiments_hypothesis_dependency_fk',
    }),
    unique('llm_recommended_experiments_owned_brand_id_experiment_hash_key').on(
      table.ownedBrandId,
      table.experimentHash,
    ),
    check(
      'llm_recommended_experiments_source_hypothesis_ref_format',
      sql`${table.sourceHypothesisRef} ~ '^h[1-9][0-9]*$'`,
    ),
    check('llm_recommended_experiments_title_not_blank', sql`char_length(trim(${table.title})) > 0`),
    check(
      'llm_recommended_experiments_objective_not_blank',
      sql`char_length(trim(${table.objective})) > 0`,
    ),
    check(
      'llm_recommended_experiments_hypothesis_under_test_not_blank',
      sql`char_length(trim(${table.hypothesisUnderTest})) > 0`,
    ),
    check(
      'llm_recommended_experiments_variable_under_test_not_blank',
      sql`char_length(trim(${table.variableUnderTest})) > 0`,
    ),
    check(
      'llm_recommended_experiments_design_valid',
      sql`jsonb_typeof(${table.design}) = 'object'
        and ${table.design} ?& array['comparison', 'variablePolicy', 'controlDescription', 'treatmentDescription']
        and ${table.design} - 'comparison' - 'variablePolicy' - 'controlDescription' - 'treatmentDescription' = '{}'::jsonb
        and ${table.design} ->> 'comparison' = 'control_vs_treatment'
        and ${table.design} ->> 'variablePolicy' = 'single_variable'
        and jsonb_typeof(${table.design} -> 'controlDescription') = 'string'
        and jsonb_typeof(${table.design} -> 'treatmentDescription') = 'string'`,
    ),
    check(
      'llm_recommended_experiments_primary_metric_allowed',
      sql`${table.primaryMetric} in (${metricList})`,
    ),
    check(
      'llm_recommended_experiments_guardrail_metrics_valid',
      sql`cardinality(${table.guardrailMetrics}) > 0
        and ${table.guardrailMetrics} <@ array[${metricList}]::text[]
        and not (${table.primaryMetric} = any(${table.guardrailMetrics}))`,
    ),
    check(
      'llm_recommended_experiments_implementation_notes_array',
      sql`jsonb_typeof(${table.implementationNotes}) = 'array' and jsonb_array_length(${table.implementationNotes}) > 0`,
    ),
    check(
      'llm_recommended_experiments_caveat_category_allowed',
      sql`${table.caveatCategory} in ('shipping_margin_exposure', 'policy_return_refund_exposure', 'subscription_customer_fit_and_cancellation', 'promotion_margin_exposure')`,
    ),
    check(
      'llm_recommended_experiments_caveat_statement_not_blank',
      sql`char_length(trim(${table.caveatStatement})) > 0`,
    ),
    check(
      'llm_recommended_experiments_claim_references_array',
      sql`jsonb_typeof(${table.claimReferences}) = 'array' and jsonb_array_length(${table.claimReferences}) > 0`,
    ),
    check(
      'llm_recommended_experiments_numeric_claims_array',
      sql`jsonb_typeof(${table.numericClaims}) = 'array'`,
    ),
    check(
      'llm_recommended_experiments_engine_version_allowed',
      sql`${table.experimentEngineVersion} = 'recommended-experiments-v2-llm'`,
    ),
    check(
      'llm_recommended_experiments_generation_provenance_valid',
      llmProvenanceCheck(table.generationProvenance, table.generationRunId),
    ),
    check(
      'llm_recommended_experiments_experiment_hash_sha256',
      sql`${table.experimentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);

// Customer-facing, validator-accepted executive briefing (at most one per generation run).
export const llmExecutiveBriefings = pgTable(
  'llm_executive_briefings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => intelligenceGenerationRuns.id, { onDelete: 'restrict' }),
    ownedBrandId: uuid('owned_brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    headline: text('headline').notNull(),
    strategicPostureSummary: text('strategic_posture_summary').notNull(),
    keyTakeaway: text('key_takeaway').notNull(),
    supportingHypothesisRefs: text('supporting_hypothesis_refs').array().notNull(),
    claimReferences: jsonb('claim_references').$type<Array<Record<string, unknown>>>().notNull(),
    numericClaims: jsonb('numeric_claims').$type<Array<Record<string, unknown>>>().notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    generationProvenance: jsonb('generation_provenance')
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('llm_executive_briefings_owned_brand_id_generated_at_idx').on(
      table.ownedBrandId,
      table.generatedAt.desc(),
    ),
    unique('llm_executive_briefings_generation_run_id_key').on(table.generationRunId),
    unique('llm_executive_briefings_run_identity_key').on(table.id, table.generationRunId),
    check(
      'llm_executive_briefings_headline_not_blank',
      sql`char_length(trim(${table.headline})) > 0`,
    ),
    check(
      'llm_executive_briefings_strategic_posture_summary_not_blank',
      sql`char_length(trim(${table.strategicPostureSummary})) > 0`,
    ),
    check(
      'llm_executive_briefings_key_takeaway_not_blank',
      sql`char_length(trim(${table.keyTakeaway})) > 0`,
    ),
    check(
      'llm_executive_briefings_claim_references_array',
      sql`jsonb_typeof(${table.claimReferences}) = 'array'`,
    ),
    check(
      'llm_executive_briefings_numeric_claims_array',
      sql`jsonb_typeof(${table.numericClaims}) = 'array'`,
    ),
    check(
      'llm_executive_briefings_generation_provenance_valid',
      llmProvenanceCheck(table.generationProvenance, table.generationRunId),
    ),
    check(
      'llm_executive_briefings_support_declared',
      sql`cardinality(${table.supportingHypothesisRefs}) > 0 or jsonb_array_length(${table.claimReferences}) > 0`,
    ),
  ],
);

export const llmExecutiveBriefingHypotheses = pgTable(
  'llm_executive_briefing_hypotheses',
  {
    briefingId: uuid('briefing_id').notNull(),
    generationRunId: uuid('generation_run_id').notNull(),
    position: smallint('position').notNull(),
    hypothesisId: uuid('hypothesis_id').notNull(),
    hypothesisRef: text('hypothesis_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.briefingId, table.position] }),
    unique('llm_executive_briefing_hypotheses_briefing_id_hypothesis_id_key').on(
      table.briefingId,
      table.hypothesisId,
    ),
    index('llm_executive_briefing_hypotheses_hypothesis_id_idx').on(table.hypothesisId),
    foreignKey({
      columns: [table.briefingId, table.generationRunId],
      foreignColumns: [llmExecutiveBriefings.id, llmExecutiveBriefings.generationRunId],
      name: 'llm_executive_briefing_hypotheses_briefing_fk',
    }),
    foreignKey({
      columns: [table.hypothesisId, table.generationRunId, table.hypothesisRef],
      foreignColumns: [
        llmStrategicHypotheses.id,
        llmStrategicHypotheses.generationRunId,
        llmStrategicHypotheses.hypothesisRef,
      ],
      name: 'llm_executive_briefing_hypotheses_hypothesis_fk',
    }),
    check('llm_executive_briefing_hypotheses_position_nonnegative', sql`${table.position} >= 0`),
  ],
);
