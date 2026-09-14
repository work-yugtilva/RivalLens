import { performance } from 'node:perf_hooks';
import {
  orchestrateIntelligence,
  type AttemptDebugInfo,
  type IntelligenceModelParameters,
  type IntelligenceModelProvider,
  type IntelligenceOrchestrationResult,
} from '@rivallens/ai';
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
  readonly timings: RunTimings;
};

// One benchmark run: the frozen fixture through the ACTUAL production-intended path
// (Phase 3D provider adapter -> Phase 3C orchestration -> Phase 2 validator). No provider
// request logic is duplicated here.
export async function runFixtureModel(input: {
  readonly fixture: FrozenFixture;
  readonly provider: IntelligenceModelProvider;
  readonly parameters?: IntelligenceModelParameters;
  // Opt-in, eval/debug-only: forwarded verbatim to orchestrateIntelligence. Undefined by
  // default, so the "ACTUAL production-intended path" this function exercises is unchanged.
  readonly onAttemptDebug?: (attempt: AttemptDebugInfo) => void;
}): Promise<FixtureModelRun> {
  const startedAt = performance.now();
  const result = await orchestrateIntelligence({
    context: input.fixture.context,
    contextHash: input.fixture.contextHash,
    provider: input.provider,
    promptVersion: INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
    systemPrompt: INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
    ...(input.parameters ? { parameters: input.parameters } : {}),
    ...(input.onAttemptDebug ? { onAttemptDebug: input.onAttemptDebug } : {}),
    deterministicFallback: {
      currentSignals: [...input.fixture.fallbackSeed.signals],
      currentHypotheses: [...input.fixture.fallbackSeed.hypotheses],
      generatedAt: input.fixture.fallbackSeed.generatedAt,
    },
  });
  const wallClockMs = performance.now() - startedAt;

  const firstAttempt = result.attempts[0];
  const repairAttempt = result.attempts.find(
    (attempt) => attempt.kind === 'retry' && attempt.retryReason === 'validation_repair',
  );

  return {
    result,
    timings: {
      wallClockMs,
      firstAttemptMs: firstAttempt?.telemetry?.latencyMs ?? null,
      repairMs: repairAttempt?.telemetry?.latencyMs ?? null,
    },
  };
}
