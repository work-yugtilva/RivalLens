import { performance } from 'node:perf_hooks';
import {
  type AttemptDebugInfo,
  type IntelligenceModelParameters,
  type IntelligenceModelProvider,
  type IntelligenceOrchestrationResult,
} from '@rivallens/ai';
import { orchestrateIntelligenceForPersistence } from '@rivallens/ai/server';
import type { IntelligenceValidationErrorCode } from '@rivallens/intelligence';
import {
  INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
  INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
} from '@rivallens/intelligence';
import type { FrozenFixture } from '../fixtures/schema';

export type RunTimings = {
  readonly wallClockMs: number;
  readonly firstAttemptMs: number | null;
  readonly repairMs: number | null;
};

export type FixtureModelRun = {
  readonly result: IntelligenceOrchestrationResult;
  readonly attempts: EvaluationAttemptSummary[];
  readonly timings: RunTimings;
};

export type EvaluationAttemptSummary = {
  readonly attemptNumber: 1 | 2;
  readonly kind: 'initial' | 'retry';
  readonly retryReason?: 'transport' | 'validation_repair';
  readonly telemetry?: import('@rivallens/ai').IntelligenceResponseTelemetry;
  readonly providerFailure?: import('@rivallens/ai').IntelligenceProviderErrorCode;
  readonly validation?: {
    readonly status: AttemptDebugInfo['validation']['status'];
    readonly errorCodes: IntelligenceValidationErrorCode[];
  };
};

// One benchmark run through the same trusted server orchestration used by production. Eval
// projects its own telemetry/diagnostic record from that envelope; the ordinary AI result stays
// safe for broader callers and no provider request logic is duplicated here.
export async function runFixtureModel(input: {
  readonly fixture: FrozenFixture;
  readonly provider: IntelligenceModelProvider;
  readonly parameters?: IntelligenceModelParameters;
  // Opt-in, eval/debug-only: forwarded verbatim to orchestrateIntelligence. Undefined by
  // default, so the "ACTUAL production-intended path" this function exercises is unchanged.
  readonly onAttemptDebug?: (attempt: AttemptDebugInfo) => void;
}): Promise<FixtureModelRun> {
  const startedAt = performance.now();
  const validationByAttempt = new Map<number, AttemptDebugInfo['validation']>();
  const trusted = await orchestrateIntelligenceForPersistence({
    context: input.fixture.context,
    contextHash: input.fixture.contextHash,
    provider: input.provider,
    promptVersion: INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
    systemPrompt: INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
    ...(input.parameters ? { parameters: input.parameters } : {}),
    onAttemptDebug: (attempt) => {
      validationByAttempt.set(attempt.attemptNumber, attempt.validation);
      input.onAttemptDebug?.(attempt);
    },
    deterministicFallback: {
      currentSignals: [...input.fixture.fallbackSeed.signals],
      currentHypotheses: [...input.fixture.fallbackSeed.hypotheses],
      generatedAt: input.fixture.fallbackSeed.generatedAt,
    },
  });
  const result = trusted.result;
  const attempts: EvaluationAttemptSummary[] = trusted.persistenceAttempts.map((attempt) => {
    const validation = validationByAttempt.get(attempt.attemptNumber);
    return {
      attemptNumber: attempt.attemptNumber,
      kind: attempt.kind,
      ...(attempt.retryReason ? { retryReason: attempt.retryReason } : {}),
      ...(attempt.telemetry ? { telemetry: attempt.telemetry } : {}),
      ...(attempt.providerFailure ? { providerFailure: attempt.providerFailure } : {}),
      ...(validation
        ? {
            validation: {
              status: validation.status,
              errorCodes: [...new Set(validation.errors.map((error) => error.code))].sort(),
            },
          }
        : {}),
    };
  });
  const wallClockMs = performance.now() - startedAt;

  const firstAttempt = attempts[0];
  const repairAttempt = attempts.find(
    (attempt) => attempt.kind === 'retry' && attempt.retryReason === 'validation_repair',
  );

  return {
    result,
    attempts,
    timings: {
      wallClockMs,
      firstAttemptMs: firstAttempt?.telemetry?.latencyMs ?? null,
      repairMs: repairAttempt?.telemetry?.latencyMs ?? null,
    },
  };
}
