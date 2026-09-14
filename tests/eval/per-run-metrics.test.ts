import { describe, expect, it } from 'vitest';
import { extractPerRunMetrics } from '../../packages/eval/src/metrics/perRun';
import { fixtureById, runMock } from './helpers/harness';

async function metricsFor(fixtureId: string, scenario: Parameters<typeof runMock>[1]) {
  const { result, timings } = await runMock(fixtureById(fixtureId), scenario);
  return { result, metrics: extractPerRunMetrics(result, timings) };
}

describe('per-run deterministic metrics', () => {
  it('a clean first attempt: schema valid, passed, all zero-tolerance counts zero', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', 'valid');
    expect(metrics.schemaValid).toBe(true);
    expect(metrics.validatorStatus).toBe('passed');
    expect(metrics.unknownEvidenceReferenceCount).toBe(0);
    expect(metrics.unsupportedNumericClaimCount).toBe(0);
    expect(metrics.competitorAttributionErrorCount).toBe(0);
    expect(metrics.epistemicViolationCount).toBe(0);
    expect(metrics.unknownAsAbsenceCount).toBe(0);
    expect(metrics.unsupportedCausalClaimCount).toBe(0);
    expect(metrics.acceptedHypothesisCount).toBe(1);
    expect(metrics.providerInvocationCount).toBe(1);
    expect(metrics.repairTriggered).toBe(false);
    expect(metrics.fallbackTriggered).toBe(false);
    expect(metrics.modelQualityEligible).toBe(true);
  });

  it('accounts for a validation repair that succeeds on the second call', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', ['unknown_evidence_id', 'valid']);
    expect(metrics.repairTriggered).toBe(true);
    expect(metrics.transportRetryTriggered).toBe(false);
    expect(metrics.providerInvocationCount).toBe(2);
    expect(metrics.validatorStatus).toBe('passed');
    expect(metrics.fallbackTriggered).toBe(false);
  });

  it('accounts for a transport retry (timeout then valid) distinctly from a repair', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', ['timeout', 'valid']);
    expect(metrics.transportRetryTriggered).toBe(true);
    expect(metrics.repairTriggered).toBe(false);
    expect(metrics.providerInvocationCount).toBe(2);
  });

  it('a non-retryable provider failure => deterministic fallback, excluded from model quality', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', 'provider_exception');
    expect(metrics.fallbackTriggered).toBe(true);
    expect(metrics.fallbackReason).toBe('PROVIDER_NON_RETRYABLE_FAILURE');
    expect(metrics.providerFailureCode).toBe('provider_exception');
    expect(metrics.acceptedHypothesisCount).toBeNull();
    expect(metrics.acceptedExperimentCount).toBeNull();
    expect(metrics.modelQualityEligible).toBe(false);
  });

  it('counts an unknown-evidence citation', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', 'unknown_evidence_id');
    expect(metrics.unknownEvidenceReferenceCount).toBeGreaterThanOrEqual(1);
    expect(metrics.validatorStatus).toBe('failed');
    expect(metrics.repairTriggered).toBe(true);
    expect(metrics.fallbackTriggered).toBe(true);
    expect(metrics.fallbackReason).toBe('VALIDATION_REPAIR_EXHAUSTED');
  });

  it('counts an unsupported numeric claim (unit mismatch)', async () => {
    const { metrics } = await metricsFor('b-shipping-threshold-diff', 'wrong_numeric_unit');
    expect(metrics.unsupportedNumericClaimCount).toBeGreaterThanOrEqual(1);
  });

  it('counts an epistemic-class violation when a snippet is claimed as observed', async () => {
    const { metrics } = await metricsFor('l-reported-snippet-evidence', 'snippet_observed_promotion');
    expect(metrics.epistemicViolationCount).toBeGreaterThanOrEqual(1);
  });
});
