import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
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
