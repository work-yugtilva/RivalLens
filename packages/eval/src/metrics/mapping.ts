import type { IntelligenceValidationErrorCode } from '@rivallens/intelligence';

// Versioned mapping from the deterministic validator's error codes to evaluation metric
// categories. Bump this string whenever the grouping changes; benchmark results computed
// under different mapping versions are not comparable.
export const METRICS_MAPPING_VERSION = 'phase-4a-metrics-v1';

export type MetricCategory =
  | 'contextIntegrity'
  | 'schemaInvalid'
  | 'unknownEvidenceReference'
  | 'competitorAttribution'
  | 'evidenceDependency'
  | 'numericPrecision'
  | 'epistemicCompliance'
  | 'unknownAsAbsence'
  | 'structuralIntegrity'
  | 'experimentDesign'
  | 'unsupportedClaim'
  | 'causalOverreach';

// The `satisfies` clause is a compile-time tripwire: if @rivallens/intelligence adds or
// removes an IntelligenceValidationErrorCode, `pnpm typecheck` fails here until this table
// and (deliberately) EVALUATION_VERSION.validatorContractVersion are updated.
export const ERROR_CODE_CATEGORY = {
  INVALID_CONTEXT_SCHEMA: 'contextIntegrity',
  INVALID_OUTPUT_SCHEMA: 'schemaInvalid',
  UNKNOWN_COMPETITOR_ID: 'unknownEvidenceReference',
  UNKNOWN_SIGNAL_ID: 'unknownEvidenceReference',
  UNKNOWN_COMPARISON_KEY: 'unknownEvidenceReference',
  UNKNOWN_OBSERVATION_ID: 'unknownEvidenceReference',
  UNKNOWN_CHANGE_ID: 'unknownEvidenceReference',
  UNKNOWN_SNIPPET_ID: 'unknownEvidenceReference',
  COMPETITOR_ATTRIBUTION_MISMATCH: 'competitorAttribution',
  EVIDENCE_DEPENDENCY_MISMATCH: 'evidenceDependency',
  UNSUPPORTED_NUMERIC_CLAIM: 'numericPrecision',
  UNIT_MISMATCH: 'numericPrecision',
  DELTA_DIRECTION_MISMATCH: 'numericPrecision',
  EPISTEMIC_CLASS_VIOLATION: 'epistemicCompliance',
  UNKNOWN_AS_ABSENCE: 'unknownAsAbsence',
  INVALID_HYPOTHESIS_REFERENCE: 'structuralIntegrity',
  EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS: 'structuralIntegrity',
  PRIMARY_METRIC_DUPLICATES_GUARDRAIL: 'experimentDesign',
  EXPERIMENT_NOT_SINGLE_VARIABLE: 'experimentDesign',
  EXPERIMENT_NOT_FRAMED_AS_TEST: 'experimentDesign',
  INAPPROPRIATE_EXPERIMENT_CAVEAT: 'experimentDesign',
  UNSUPPORTED_EXPERIMENT_CLAIM: 'unsupportedClaim',
  UNSUPPORTED_CAUSAL_CLAIM: 'causalOverreach',
  UNSUPPORTED_BRIEFING_CLAIM: 'unsupportedClaim',
} satisfies Record<IntelligenceValidationErrorCode, MetricCategory>;

export const ALL_VALIDATION_ERROR_CODES = Object.keys(
  ERROR_CODE_CATEGORY,
).sort() as IntelligenceValidationErrorCode[];

export function categoryOf(code: IntelligenceValidationErrorCode): MetricCategory {
  return ERROR_CODE_CATEGORY[code];
}

// Categories that map to a zero-tolerance hard eligibility gate. Kept separate from any
// subjective quality scoring.
export const ZERO_TOLERANCE_CATEGORIES = [
  'unknownEvidenceReference',
  'competitorAttribution',
  'numericPrecision',
  'epistemicCompliance',
  'unknownAsAbsence',
  'causalOverreach',
] as const satisfies readonly MetricCategory[];

export type ZeroToleranceCategory = (typeof ZERO_TOLERANCE_CATEGORIES)[number];
