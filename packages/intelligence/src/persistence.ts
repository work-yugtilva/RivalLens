import { createHash } from 'node:crypto';
import {
  intelligenceContextSchema,
  llmIntelligencePersistencePayloadSchema,
  LLM_RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
  LLM_STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
  persistIntelligenceGenerationInputSchema,
  type IntelligenceContext,
  type IntelligenceGenerationAttemptInput,
  type IntelligenceGenerationOutcome,
  type IntelligenceValidationSummary,
  type LlmGenerationProvenance,
  type LlmIntelligencePersistencePayload,
  type PersistIntelligenceGenerationInput,
} from '@rivallens/schemas';
import { canonicalContext, intelligenceContextHash } from './context';
import { validateIntelligenceSynthesis, type IntelligenceValidationResult } from './validation';

// Identifies the grounding-validator behaviour that judged persisted intelligence. Bump together
// with the evaluation harness's validator contract version whenever validator semantics change.
export const INTELLIGENCE_VALIDATOR_CONTRACT_VERSION = 'intelligence-validator-contract-2026-09-14';

export type IntelligencePersistenceRejectionCode =
  | 'INVALID_INPUT'
  | 'INVALID_CONTEXT'
  | 'CONTEXT_HASH_MISMATCH'
  | 'MISSING_CANDIDATE_OUTPUT'
  | 'DEPENDENCY_INVARIANT_VIOLATION';

export type PrepareIntelligenceGenerationPersistenceResult =
  | { readonly status: 'ready'; readonly payload: LlmIntelligencePersistencePayload }
  | {
      readonly status: 'rejected';
      readonly code: IntelligencePersistenceRejectionCode;
      readonly issues: ReadonlyArray<{ path: Array<string | number>; message: string }>;
    };

function rejected(
  code: IntelligencePersistenceRejectionCode,
  issues: Array<{ path: Array<string | number>; message: string }>,
): PrepareIntelligenceGenerationPersistenceResult {
  return { status: 'rejected', code, issues };
}

function rowHash(generationRunId: string, contextHash: string, item: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalContext({ generationRunId, intelligenceContextHash: contextHash, item }))
    .digest('hex')}`;
}

function attemptSequenceIssues(
  input: PersistIntelligenceGenerationInput,
): Array<{ path: Array<string | number>; message: string }> {
  const issues: Array<{ path: Array<string | number>; message: string }> = [];
  for (const [index, attempt] of input.attempts.entries()) {
    const path = ['attempts', index];
    if (attempt.attemptNumber !== index + 1) {
      issues.push({ path: [...path, 'attemptNumber'], message: 'Attempts must be sequential' });
    }
    if (index === 0 && (attempt.kind !== 'initial' || attempt.retryReason !== undefined)) {
      issues.push({ path: [...path, 'kind'], message: 'The first attempt must be initial' });
    }
    if (index > 0 && (attempt.kind !== 'retry' || attempt.retryReason === undefined)) {
      issues.push({ path: [...path, 'kind'], message: 'Later attempts must be reasoned retries' });
    }
    if ((attempt.providerFailure === undefined) === (attempt.telemetry === undefined)) {
      issues.push({
        path,
        message: 'An attempt carries either provider telemetry or a provider failure',
      });
    }
    if (attempt.providerFailure === undefined && attempt.providerFailureMetadata !== undefined) {
      issues.push({
        path: [...path, 'providerFailureMetadata'],
        message: 'Failure metadata requires a provider failure',
      });
    }
    if (attempt.providerFailure !== undefined && attempt.rawOutput !== undefined) {
      issues.push({
        path: [...path, 'rawOutput'],
        message: 'A failed provider invocation cannot have raw output',
      });
    }
    if (attempt.rawOutput !== undefined && attempt.rawOutput.value === undefined) {
      issues.push({
        path: [...path, 'rawOutput'],
        message: 'Captured raw output must be a JSON value',
      });
    }
    if (
      attempt.telemetry &&
      (attempt.telemetry.providerId !== input.providerId ||
        attempt.telemetry.modelId !== input.modelId)
    ) {
      issues.push({
        path: [...path, 'telemetry'],
        message: 'Attempt telemetry must match the run provider and model',
      });
    }
  }
  return issues;
}

function summarizeValidation(validation: IntelligenceValidationResult): IntelligenceValidationSummary {
  const codes = (errors: IntelligenceValidationResult['errors']) =>
    [...new Set(errors.map((error) => error.code))].sort();
  return {
    status: validation.status,
    errors: validation.errors.map((error) => ({ code: error.code, path: error.path })),
    hypotheses: validation.hypotheses.map((item) => ({
      index: item.index,
      status: item.status,
      errorCodes: codes(item.errors),
    })),
    experiments: validation.experiments.map((item) => ({
      index: item.index,
      status: item.status,
      errorCodes: codes(item.errors),
    })),
    executiveBriefing: {
      status: validation.executiveBriefing.status,
      errorCodes: codes(validation.executiveBriefing.errors),
    },
  };
}

function attemptPayload(
  attempt: IntelligenceGenerationAttemptInput,
  validation: IntelligenceValidationResult | undefined,
): LlmIntelligencePersistencePayload['attempts'][number] {
  const telemetry = attempt.telemetry;
  return {
    attemptNumber: attempt.attemptNumber,
    kind: attempt.kind,
    retryReason: attempt.retryReason ?? null,
    promptVersion: attempt.promptVersion,
    latencyMs: telemetry ? Math.round(telemetry.latencyMs) : null,
    inputTokens: telemetry?.inputTokens ?? null,
    outputTokens: telemetry?.outputTokens ?? null,
    totalTokens: telemetry?.totalTokens ?? null,
    estimatedCostUsd: telemetry?.estimatedCostUsd ?? null,
    rawResponseId: telemetry?.rawResponseId ?? null,
    finishReason: telemetry?.finishReason ?? null,
    providerFailure: attempt.providerFailure ?? null,
    providerFailureMetadata: attempt.providerFailureMetadata ?? null,
    rawOutputCaptured: attempt.rawOutput !== undefined,
    rawOutput: attempt.rawOutput?.value ?? null,
    validationStatus: validation?.status ?? null,
    validationErrorCodes: validation
      ? [...new Set(validation.errors.map((error) => error.code))].sort()
      : [],
  };
}

/**
 * Trust boundary between generation and customer-facing intelligence storage.
 *
 * Re-parses the exact frozen context used for generation (never rebuilding it), re-verifies its
 * canonical hash, and re-runs `validateIntelligenceSynthesis` on the final captured candidate
 * against that context. Only THIS validation's `acceptedOutput` becomes customer-facing payload;
 * any earlier orchestration verdict is ignored. The returned payload is the exact input of the
 * transactional `persist_llm_intelligence_generation` RPC.
 */
export function prepareIntelligenceGenerationPersistence(
  input: unknown,
): PrepareIntelligenceGenerationPersistenceResult {
  const envelope = persistIntelligenceGenerationInputSchema.safeParse(input);
  if (!envelope.success) {
    return rejected(
      'INVALID_INPUT',
      envelope.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  const request = envelope.data;

  const parsedContext = intelligenceContextSchema.safeParse(request.context);
  if (!parsedContext.success) {
    return rejected(
      'INVALID_CONTEXT',
      parsedContext.error.issues.map((issue) => ({
        path: ['context', ...issue.path],
        message: issue.message,
      })),
    );
  }
  const context: IntelligenceContext = parsedContext.data;
  // The stored context must be byte-identical (canonically) to what the model received.
  if (canonicalContext(context) !== canonicalContext(request.context)) {
    return rejected('INVALID_CONTEXT', [
      { path: ['context'], message: 'The frozen context is not in canonical schema form' },
    ]);
  }
  const actualContextHash = intelligenceContextHash(context);
  if (actualContextHash !== request.contextHash) {
    return rejected('CONTEXT_HASH_MISMATCH', [
      { path: ['contextHash'], message: 'The declared hash does not match the frozen context' },
    ]);
  }

  const sequenceIssues = attemptSequenceIssues(request);
  if (sequenceIssues.length > 0) return rejected('INVALID_INPUT', sequenceIssues);

  const attemptValidations = request.attempts.map((attempt) =>
    attempt.rawOutput === undefined
      ? undefined
      : validateIntelligenceSynthesis({ context, output: attempt.rawOutput.value }),
  );
  const finalAttemptValidation = attemptValidations[attemptValidations.length - 1];
  const lastCapturedValidation = [...attemptValidations]
    .reverse()
    .find((validation) => validation !== undefined);

  let outcome: IntelligenceGenerationOutcome;
  let summaryValidation: IntelligenceValidationResult | undefined;
  let accepted: IntelligenceValidationResult['acceptedOutput'] = { hypotheses: [], experiments: [] };
  switch (request.generationOutcome.kind) {
    case 'llm_candidate': {
      if (!finalAttemptValidation) {
        return rejected('MISSING_CANDIDATE_OUTPUT', [
          {
            path: ['attempts', request.attempts.length - 1, 'rawOutput'],
            message: 'An LLM candidate requires captured output from the final attempt',
          },
        ]);
      }
      summaryValidation = finalAttemptValidation;
      switch (finalAttemptValidation.status) {
        case 'passed':
          outcome = 'llm_success';
          accepted = finalAttemptValidation.acceptedOutput;
          break;
        case 'partial':
          outcome = 'llm_partial';
          accepted = finalAttemptValidation.acceptedOutput;
          break;
        case 'failed':
          outcome = 'llm_rejected';
          break;
      }
      break;
    }
    case 'deterministic_fallback':
      // Fallback content is deterministic v1 intelligence persisted by its own engines; nothing
      // from the model reaches customer-facing LLM tables and no LLM provenance is minted.
      outcome = 'deterministic_fallback';
      summaryValidation = lastCapturedValidation;
      break;
  }

  const acceptedRefs = new Set(accepted.hypotheses.map((hypothesis) => hypothesis.ref));
  const dependencyIssues: Array<{ path: Array<string | number>; message: string }> = [];
  if (acceptedRefs.size !== accepted.hypotheses.length) {
    dependencyIssues.push({ path: ['hypotheses'], message: 'Accepted hypothesis refs collide' });
  }
  for (const [index, experiment] of accepted.experiments.entries()) {
    if (!acceptedRefs.has(experiment.hypothesisRef)) {
      dependencyIssues.push({
        path: ['experiments', index, 'hypothesisRef'],
        message: 'Accepted experiment depends on a hypothesis that was not accepted',
      });
    }
  }
  for (const ref of accepted.executiveBriefing?.supportingHypothesisRefs ?? []) {
    if (!acceptedRefs.has(ref)) {
      dependencyIssues.push({
        path: ['executiveBriefing', 'supportingHypothesisRefs'],
        message: 'Accepted briefing depends on a hypothesis that was not accepted',
      });
    }
  }
  if (dependencyIssues.length > 0) {
    return rejected('DEPENDENCY_INVARIANT_VIOLATION', dependencyIssues);
  }

  const provenance: LlmGenerationProvenance = {
    method: 'llm_synthesized',
    generationRunId: request.generationRunId,
    providerId: request.providerId,
    modelId: request.modelId,
    promptVersion: request.promptVersion,
    intelligenceContextHash: actualContextHash,
    validatorContractVersion: INTELLIGENCE_VALIDATOR_CONTRACT_VERSION,
  };
  const runId = request.generationRunId;

  const payload = llmIntelligencePersistencePayloadSchema.safeParse({
    generationRunId: runId,
    // Tenant scope is derived from the frozen context itself, never from a separate caller field.
    ownedBrandId: context.brand.id,
    competitorIds: context.competitors.map((competitor) => competitor.id),
    analysisObjective: context.analysisObjective,
    contextVersion: context.contextVersion,
    intelligenceContext: context,
    intelligenceContextHash: actualContextHash,
    contextGeneratedAt: context.generatedAt,
    promptVersion: request.promptVersion,
    validatorContractVersion: INTELLIGENCE_VALIDATOR_CONTRACT_VERSION,
    providerId: request.providerId,
    modelId: request.modelId,
    modelParameters: request.parameters,
    outcome,
    fallbackReason:
      request.generationOutcome.kind === 'deterministic_fallback'
        ? request.generationOutcome.fallbackReason
        : null,
    validationStatus: summaryValidation?.status ?? null,
    validationSummary: summaryValidation ? summarizeValidation(summaryValidation) : null,
    acceptedHypothesisCount: accepted.hypotheses.length,
    acceptedExperimentCount: accepted.experiments.length,
    executiveBriefingAccepted: accepted.executiveBriefing !== undefined,
    attempts: request.attempts.map((attempt, index) =>
      attemptPayload(attempt, attemptValidations[index]),
    ),
    hypotheses: accepted.hypotheses.map((hypothesis) => ({
      ref: hypothesis.ref,
      competitorId: hypothesis.competitorId,
      theme: hypothesis.theme,
      statement: hypothesis.statement,
      rationale: hypothesis.rationale,
      confidence: hypothesis.confidence,
      uncertaintyCategory: hypothesis.uncertainty.category,
      uncertaintyStatement: hypothesis.uncertainty.statement,
      assumptions: hypothesis.assumptions,
      epistemicClassDependencies: hypothesis.epistemicClassDependencies,
      supportingSignalIds: hypothesis.supportingSignalIds,
      supportingComparisonKeys: hypothesis.supportingComparisonKeys,
      claimReferences: hypothesis.claimReferences,
      numericClaims: hypothesis.numericClaims,
      hypothesisEngineVersion: LLM_STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
      generationProvenance: provenance,
      hypothesisHash: rowHash(runId, actualContextHash, hypothesis),
    })),
    experiments: accepted.experiments.map((experiment) => ({
      hypothesisRef: experiment.hypothesisRef,
      competitorId: experiment.competitorId,
      title: experiment.title,
      objective: experiment.objective,
      hypothesisUnderTest: experiment.hypothesisUnderTest,
      variableUnderTest: experiment.variableUnderTest,
      design: experiment.design,
      primaryMetric: experiment.primaryMetric,
      guardrailMetrics: experiment.guardrailMetrics,
      implementationNotes: experiment.implementationNotes,
      caveatCategory: experiment.caveat.category,
      caveatStatement: experiment.caveat.statement,
      claimReferences: experiment.claimReferences,
      numericClaims: experiment.numericClaims,
      experimentEngineVersion: LLM_RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
      generationProvenance: provenance,
      experimentHash: rowHash(runId, actualContextHash, experiment),
    })),
    executiveBriefing: accepted.executiveBriefing
      ? {
          headline: accepted.executiveBriefing.headline,
          strategicPostureSummary: accepted.executiveBriefing.strategicPostureSummary,
          keyTakeaway: accepted.executiveBriefing.keyTakeaway,
          supportingHypothesisRefs: accepted.executiveBriefing.supportingHypothesisRefs,
          claimReferences: accepted.executiveBriefing.claimReferences,
          numericClaims: accepted.executiveBriefing.numericClaims,
          generationProvenance: provenance,
        }
      : null,
  });
  if (!payload.success) {
    return rejected(
      'INVALID_INPUT',
      payload.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return { status: 'ready', payload: payload.data };
}
