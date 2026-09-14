import { describe, expect, it } from 'vitest';
import {
  ALL_VALIDATION_ERROR_CODES,
  ERROR_CODE_CATEGORY,
  METRICS_MAPPING_VERSION,
  ZERO_TOLERANCE_CATEGORIES,
  categoryOf,
} from '../../packages/eval/src/metrics/mapping';

describe('deterministic metrics mapping', () => {
  it('pins a mapping version', () => {
    expect(METRICS_MAPPING_VERSION).toBe('phase-4a-metrics-v1');
  });

  it('assigns exactly one category to every validator error code', () => {
    expect(ALL_VALIDATION_ERROR_CODES).toHaveLength(24);
    for (const code of ALL_VALIDATION_ERROR_CODES) {
      expect(typeof categoryOf(code)).toBe('string');
    }
  });

  it('is a stable, sorted snapshot of the validator contract', () => {
    expect([...ALL_VALIDATION_ERROR_CODES]).toEqual([
      'COMPETITOR_ATTRIBUTION_MISMATCH',
      'DELTA_DIRECTION_MISMATCH',
      'EPISTEMIC_CLASS_VIOLATION',
      'EVIDENCE_DEPENDENCY_MISMATCH',
      'EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS',
      'EXPERIMENT_NOT_FRAMED_AS_TEST',
      'EXPERIMENT_NOT_SINGLE_VARIABLE',
      'INAPPROPRIATE_EXPERIMENT_CAVEAT',
      'INVALID_CONTEXT_SCHEMA',
      'INVALID_HYPOTHESIS_REFERENCE',
      'INVALID_OUTPUT_SCHEMA',
      'PRIMARY_METRIC_DUPLICATES_GUARDRAIL',
      'UNIT_MISMATCH',
      'UNKNOWN_AS_ABSENCE',
      'UNKNOWN_CHANGE_ID',
      'UNKNOWN_COMPARISON_KEY',
      'UNKNOWN_COMPETITOR_ID',
      'UNKNOWN_OBSERVATION_ID',
      'UNKNOWN_SIGNAL_ID',
      'UNKNOWN_SNIPPET_ID',
      'UNSUPPORTED_BRIEFING_CLAIM',
      'UNSUPPORTED_CAUSAL_CLAIM',
      'UNSUPPORTED_EXPERIMENT_CLAIM',
      'UNSUPPORTED_NUMERIC_CLAIM',
    ]);
  });

  it('groups unknown-evidence citation codes together', () => {
    for (const code of [
      'UNKNOWN_COMPETITOR_ID',
      'UNKNOWN_SIGNAL_ID',
      'UNKNOWN_COMPARISON_KEY',
      'UNKNOWN_OBSERVATION_ID',
      'UNKNOWN_CHANGE_ID',
      'UNKNOWN_SNIPPET_ID',
    ] as const) {
      expect(ERROR_CODE_CATEGORY[code]).toBe('unknownEvidenceReference');
    }
  });

  it('maps the zero-tolerance codes to zero-tolerance categories', () => {
    expect(ERROR_CODE_CATEGORY.COMPETITOR_ATTRIBUTION_MISMATCH).toBe('competitorAttribution');
    expect(ERROR_CODE_CATEGORY.UNSUPPORTED_NUMERIC_CLAIM).toBe('numericPrecision');
    expect(ERROR_CODE_CATEGORY.UNIT_MISMATCH).toBe('numericPrecision');
    expect(ERROR_CODE_CATEGORY.DELTA_DIRECTION_MISMATCH).toBe('numericPrecision');
    expect(ERROR_CODE_CATEGORY.EPISTEMIC_CLASS_VIOLATION).toBe('epistemicCompliance');
    expect(ERROR_CODE_CATEGORY.UNKNOWN_AS_ABSENCE).toBe('unknownAsAbsence');
    expect(ERROR_CODE_CATEGORY.UNSUPPORTED_CAUSAL_CLAIM).toBe('causalOverreach');
    for (const category of ZERO_TOLERANCE_CATEGORIES) {
      expect(Object.values(ERROR_CODE_CATEGORY)).toContain(category);
    }
  });
});
