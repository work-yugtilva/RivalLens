import type { IntelligenceOrchestrationResult } from '@rivallens/ai';
import type { IntelligenceValidationErrorCode } from '@rivallens/intelligence';
import { categoryOf, type MetricCategory } from './mapping';
import type { RunTimings } from '../runner/runFixtureModel';
import type { EvaluationAttemptSummary } from '../runner/runFixtureModel';

export type TerminalValidatorStatus = 'passed' | 'partial' | 'failed' | null;

export type PerRunMetrics = {
  // --- hard deterministic metrics ---
  readonly schemaValid: boolean;
  readonly validatorStatus: TerminalValidatorStatus;
  readonly unknownEvidenceReferenceCount: number;
  readonly unsupportedNumericClaimCount: number;
  readonly competitorAttributionErrorCount: number;
  readonly epistemicViolationCount: number;
  readonly unknownAsAbsenceCount: number;
  readonly unsupportedCausalClaimCount: number;
  readonly acceptedHypothesisCount: number | null;
  readonly acceptedExperimentCount: number | null;
  readonly executiveBriefingAccepted: boolean;
  readonly fallbackTriggered: boolean;
  readonly fallbackReason: string | null;
  readonly repairTriggered: boolean;
  readonly transportRetryTriggered: boolean;
  readonly providerInvocationCount: number;
  // A candidate run is quality-eligible only when the MODEL produced accepted output.
  // Deterministic-fallback runs are excluded from all model-quality scoring.
  readonly modelQualityEligible: boolean;
  // Reliability-only view of the fallback output size (never scored as model quality).
  readonly fallbackAcceptedHypothesisCount: number | null;
  readonly fallbackAcceptedExperimentCount: number | null;
  readonly providerFailureCode: string | null;
  // Token usage summed across attempts. null if any attempt lacks telemetry.
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly timings: RunTimings;
};

function sumTokens(
  attempts: readonly EvaluationAttemptSummary[],
  field: 'inputTokens' | 'outputTokens' | 'totalTokens',
): number | null {
  let total = 0;
  let sawTelemetry = false;
  for (const attempt of attempts) {
    if (!attempt.telemetry) continue;
    const value = attempt.telemetry[field];
    if (value === null) return null;
    total += value;
    sawTelemetry = true;
  }
  return sawTelemetry ? total : null;
}

function terminalAttempt(
  attempts: readonly EvaluationAttemptSummary[],
): EvaluationAttemptSummary | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]!.validation) return attempts[index];
  }
  return undefined;
}

// Distinct-error-code counts per run (the orchestrated path exposes a deduped, sorted list
// of error codes per attempt, not per-item multiplicity).
function categoryCount(
  codes: readonly IntelligenceValidationErrorCode[],
  category: MetricCategory,
): number {
  let count = 0;
  for (const code of codes) {
    if (categoryOf(code) === category) count += 1;
  }
  return count;
}

export function extractPerRunMetrics(
  result: IntelligenceOrchestrationResult,
  attempts: readonly EvaluationAttemptSummary[],
  timings: RunTimings,
): PerRunMetrics {
  const providerInvocationCount = attempts.length;
  const repairTriggered = attempts.some(
    (attempt) => attempt.kind === 'retry' && attempt.retryReason === 'validation_repair',
  );
  const transportRetryTriggered = attempts.some((attempt) => attempt.retryReason === 'transport');
  const fallbackTriggered = result.status === 'deterministic_fallback';
  const fallbackReason = fallbackTriggered ? result.fallbackReason : null;

  const terminal = terminalAttempt(attempts);
  const errorCodes = terminal?.validation?.errorCodes ?? [];
  const validatorStatus: TerminalValidatorStatus = terminal?.validation?.status ?? null;
  const schemaValid = terminal != null && !errorCodes.includes('INVALID_OUTPUT_SCHEMA');

  const providerFailureCode =
    attempts.find((attempt) => attempt.providerFailure)?.providerFailure ?? null;

  const modelQualityEligible = result.status === 'llm_success' || result.status === 'llm_partial';

  let acceptedHypothesisCount: number | null = null;
  let acceptedExperimentCount: number | null = null;
  let executiveBriefingAccepted = false;
  let fallbackAcceptedHypothesisCount: number | null = null;
  let fallbackAcceptedExperimentCount: number | null = null;

  if (modelQualityEligible) {
    const accepted = result.acceptedOutput as {
      hypotheses: unknown[];
      experiments: unknown[];
      executiveBriefing?: unknown;
    };
    acceptedHypothesisCount = accepted.hypotheses.length;
    acceptedExperimentCount = accepted.experiments.length;
    executiveBriefingAccepted = accepted.executiveBriefing !== undefined;
  } else if (fallbackTriggered) {
    const fallback = result.acceptedOutput as { hypotheses: unknown[]; experiments: unknown[] };
    fallbackAcceptedHypothesisCount = fallback.hypotheses.length;
    fallbackAcceptedExperimentCount = fallback.experiments.length;
  }

  return {
    schemaValid,
    validatorStatus,
    unknownEvidenceReferenceCount: categoryCount(errorCodes, 'unknownEvidenceReference'),
    unsupportedNumericClaimCount: categoryCount(errorCodes, 'numericPrecision'),
    competitorAttributionErrorCount: categoryCount(errorCodes, 'competitorAttribution'),
    epistemicViolationCount: categoryCount(errorCodes, 'epistemicCompliance'),
    unknownAsAbsenceCount: categoryCount(errorCodes, 'unknownAsAbsence'),
    unsupportedCausalClaimCount: categoryCount(errorCodes, 'causalOverreach'),
    acceptedHypothesisCount,
    acceptedExperimentCount,
    executiveBriefingAccepted,
    fallbackTriggered,
    fallbackReason,
    repairTriggered,
    transportRetryTriggered,
    providerInvocationCount,
    modelQualityEligible,
    fallbackAcceptedHypothesisCount,
    fallbackAcceptedExperimentCount,
    providerFailureCode,
    inputTokens: sumTokens(attempts, 'inputTokens'),
    outputTokens: sumTokens(attempts, 'outputTokens'),
    totalTokens: sumTokens(attempts, 'totalTokens'),
    timings,
  };
}
