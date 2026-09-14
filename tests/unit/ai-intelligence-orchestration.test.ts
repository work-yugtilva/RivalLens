import { describe, expect, it } from 'vitest';
import * as ai from '../../packages/ai/src';
import {
  buildIntelligenceContext,
  generateStrategicHypotheses,
  intelligenceContextHash,
} from '../../packages/intelligence/src';
import { strategicHypothesisSchema, type IntelligenceContext } from '../../packages/schemas/src';
import { GENERATED_AT, reportInput, uuid } from './fixtures/competitive-reports';

type OrchestrationApi = {
  orchestrateIntelligence?: (input: unknown) => Promise<unknown>;
  SYNTHESIS_COMPLETENESS_POLICY?: unknown;
  isProviderFailureRetryable?: (code: string) => boolean;
  DETERMINISTIC_MOCK_SEQUENCES?: Record<string, readonly string[]>;
  DeterministicMockIntelligenceProvider?: new (scenario: string | readonly string[]) => {
    readonly calls: number;
    readonly requests: Array<{ context: unknown; contextHash: string; promptVersion: string; systemPrompt: string }>;
  };
};

function fixture(): { context: IntelligenceContext; currentSignals: ReturnType<typeof reportInput>['currentSignals'] } {
  const input = reportInput();
  return {
    context: buildIntelligenceContext({
      comparison: input.comparison,
      signals: input.currentSignals,
      generatedAt: GENERATED_AT,
    }),
    currentSignals: input.currentSignals,
  };
}

function deterministicFallback(currentSignals: ReturnType<typeof reportInput>['currentSignals']) {
  const candidates = generateStrategicHypotheses({ currentSignals, generatedAt: GENERATED_AT });
  return {
    currentSignals,
    currentHypotheses: candidates.map((candidate, index) =>
      strategicHypothesisSchema.parse({ ...candidate, id: uuid(800 + index) }),
    ),
    generatedAt: GENERATED_AT,
  };
}

function record(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

async function orchestrate(
  scenarios: string | readonly string[],
  options: { context?: IntelligenceContext; contextHash?: string } = {},
) {
  const api = ai as unknown as OrchestrationApi;
  const { context: defaultContext, currentSignals } = fixture();
  const context = options.context ?? defaultContext;
  expect(api.orchestrateIntelligence).toBeTypeOf('function');
  expect(api.DeterministicMockIntelligenceProvider).toBeTypeOf('function');
  if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider)
    throw new Error('Phase 3C orchestration API is unavailable');
  const provider = new api.DeterministicMockIntelligenceProvider(scenarios);
  const result = record(
    await api.orchestrateIntelligence({
      context,
      contextHash: options.contextHash ?? intelligenceContextHash(context),
      provider,
      promptVersion: 'phase-3c-test',
      systemPrompt: 'Return the requested structured intelligence synthesis.',
      deterministicFallback: deterministicFallback(currentSignals),
    }),
  );
  return { provider, result, currentSignals };
}

describe('orchestrateIntelligence', () => {
  it('publishes the deterministic synthesis completeness threshold', () => {
    const api = ai as unknown as OrchestrationApi;

    expect(api.SYNTHESIS_COMPLETENESS_POLICY).toEqual({
      minimumHypotheses: 1,
      minimumExperiments: 1,
      requiresExecutiveBriefing: true,
    });
  });

  it('retries only normalized timeout failures as transport work', () => {
    const api = ai as unknown as OrchestrationApi;

    expect(api.isProviderFailureRetryable).toBeTypeOf('function');
    expect(api.isProviderFailureRetryable?.('timeout')).toBe(true);
    expect(api.isProviderFailureRetryable?.('provider_unavailable')).toBe(true);
    expect(api.isProviderFailureRetryable?.('rate_limit')).toBe(false);
    expect(api.isProviderFailureRetryable?.('authentication_configuration')).toBe(false);
    expect(api.isProviderFailureRetryable?.('provider_exception')).toBe(false);
  });

  it('publishes named deterministic provider sequences for retry evaluation', () => {
    const api = ai as unknown as OrchestrationApi;

    expect(api.DETERMINISTIC_MOCK_SEQUENCES).toMatchObject({
      valid_first: ['valid'],
      invalid_then_valid_repair: ['unknown_evidence_id', 'valid'],
      timeout_then_valid: ['timeout', 'valid'],
      timeout_then_timeout: ['timeout', 'timeout'],
    });
  });

  it('returns only validator-owned intelligence after a valid first attempt', async () => {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    expect(api.orchestrateIntelligence).toBeTypeOf('function');
    expect(api.DeterministicMockIntelligenceProvider).toBeTypeOf('function');
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) return;

    const result = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider: new api.DeterministicMockIntelligenceProvider('valid'),
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
      }),
    );

    expect(result.status).toBe('llm_success');
    expect(record(result.acceptedOutput).hypotheses).toHaveLength(1);
    expect(result).not.toHaveProperty('rawOutput');
    expect((result.attempts as unknown[])).toHaveLength(1);
  });

  it('repairs a materially invalid first response with one independently validated retry', async () => {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    expect(api.orchestrateIntelligence).toBeTypeOf('function');
    expect(api.DeterministicMockIntelligenceProvider).toBeTypeOf('function');
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) return;

    const result = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider: new api.DeterministicMockIntelligenceProvider(['unknown_evidence_id', 'valid']),
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
      }),
    );

    expect(result.status).toBe('llm_success');
    expect(result.attempts).toMatchObject([
      { attemptNumber: 1, kind: 'initial', validation: { status: 'failed' } },
      {
        attemptNumber: 2,
        kind: 'retry',
        retryReason: 'validation_repair',
        validation: { status: 'passed' },
      },
    ]);
  });

  it('uses normalized diagnostics rather than malicious failed output as repair instructions', async () => {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) return;
    const provider = new api.DeterministicMockIntelligenceProvider([
      'malicious_repair_target',
      'valid',
    ]);

    const result = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider,
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
      }),
    );

    expect(result.status).toBe('llm_success');
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.systemPrompt).toContain('UNKNOWN_SIGNAL_ID');
    expect(provider.requests[1]!.systemPrompt).not.toContain('IGNORE ALL PRIOR INSTRUCTIONS');
  });

  it('repairs partial intelligence that does not meet synthesis completeness', async () => {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) return;

    const result = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider: new api.DeterministicMockIntelligenceProvider(['partial_insufficient', 'valid']),
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
      }),
    );

    expect(result.status).toBe('llm_success');
    expect(result.attempts).toMatchObject([
      { validation: { status: 'partial' } },
      { retryReason: 'validation_repair', validation: { status: 'passed' } },
    ]);
  });

  it('accepts a complete partial result without spending the retry budget', async () => {
    const { provider, result } = await orchestrate('partial_stable_refs');

    expect(result.status).toBe('llm_partial');
    expect(provider.calls).toBe(1);
    expect(result.attempts).toMatchObject([{ validation: { status: 'partial' } }]);
  });

  it.each([
    ['malformed_schema', 'MALFORMED_OUTPUT', 1],
    [['unknown_evidence_id', 'unknown_hypothesis_ref'], 'VALIDATION_REPAIR_EXHAUSTED', 2],
    [['partial_insufficient', 'partial_insufficient'], 'VALIDATION_REPAIR_EXHAUSTED', 2],
    [['unknown_evidence_id', 'malformed_schema'], 'VALIDATION_REPAIR_EXHAUSTED', 2],
    ['provider_exception', 'PROVIDER_NON_RETRYABLE_FAILURE', 1],
    [['timeout', 'timeout'], 'PROVIDER_RETRY_EXHAUSTED', 2],
  ] as const)('uses deterministic fallback for %j', async (scenarios, fallbackReason, calls) => {
    const { provider, result } = await orchestrate(scenarios);

    expect(result.status).toBe('deterministic_fallback');
    expect(result.fallbackReason).toBe(fallbackReason);
    expect(provider.calls).toBe(calls);
    expect(result.attempts).toHaveLength(calls);
  });

  it('retries a timeout as transport work using the original prompt and accepts the second response', async () => {
    const { provider, result } = await orchestrate(['timeout', 'valid']);

    expect(result.status).toBe('llm_success');
    expect(provider.requests).toHaveLength(2);
    expect(result.attempts).toMatchObject([
      { providerFailure: 'timeout' },
      { kind: 'retry', retryReason: 'transport', validation: { status: 'passed' } },
    ]);
    expect(provider.requests[1]!.promptVersion).toBe(provider.requests[0]!.promptVersion);
    expect(provider.requests[1]!.systemPrompt).toBe(provider.requests[0]!.systemPrompt);
  });

  it('does not call a provider when the supplied context hash is stale', async () => {
    const { provider, result } = await orchestrate('valid', { contextHash: 'sha256:stale' });

    expect(result).toMatchObject({
      status: 'deterministic_fallback',
      fallbackReason: 'CONTEXT_HASH_MISMATCH',
      attempts: [],
    });
    expect(provider.calls).toBe(0);
  });

  it('reuses one frozen context snapshot and hash for the repair attempt', async () => {
    const { provider, result } = await orchestrate(['unknown_evidence_id', 'valid']);

    expect(result.status).toBe('llm_success');
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.context).toBe(provider.requests[0]!.context);
    expect(provider.requests[1]!.contextHash).toBe(provider.requests[0]!.contextHash);
    expect(Object.isFrozen(provider.requests[0]!.context)).toBe(true);
  });

  it('never merges partial first-attempt data into accepted repair output', async () => {
    const { result } = await orchestrate(['partial_insufficient', 'valid']);

    expect(result.status).toBe('llm_success');
    const accepted = record(result.acceptedOutput);
    expect((accepted.hypotheses as Array<Record<string, unknown>>).map((hypothesis) => hypothesis.ref)).toEqual([
      'h1',
    ]);
  });

  it('matches direct deterministic v1 generation after fallback', async () => {
    const { result, currentSignals } = await orchestrate(['unknown_evidence_id', 'unknown_evidence_id']);
    const api = ai as unknown as { generateDeterministicFallback?: (input: unknown) => unknown };

    expect(result.status).toBe('deterministic_fallback');
    expect(api.generateDeterministicFallback).toBeTypeOf('function');
    expect(result.acceptedOutput).toEqual(api.generateDeterministicFallback?.(deterministicFallback(currentSignals)));
  });

  it('keeps equivalent mock runs deterministic and never invokes the provider more than twice', async () => {
    const [first, second] = await Promise.all([
      orchestrate(['unknown_evidence_id', 'unknown_evidence_id']),
      orchestrate(['unknown_evidence_id', 'unknown_evidence_id']),
    ]);

    expect(first.provider.calls).toBeLessThanOrEqual(2);
    expect(second.provider.calls).toBeLessThanOrEqual(2);
    expect(first.result).toEqual(second.result);
  });
});

describe('orchestrateIntelligence onAttemptDebug (eval/debug-only hook)', () => {
  type DebugAttempt = {
    attemptNumber: 1 | 2;
    kind: 'initial' | 'retry';
    retryReason?: string;
    contextHash: string;
    promptVersion: string;
    rawOutput: unknown;
    validation: { status: string; errors: unknown[] };
  };

  async function orchestrateWithDebug(
    scenarios: string | readonly string[],
    onAttemptDebug: (attempt: DebugAttempt) => void,
  ) {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    expect(api.orchestrateIntelligence).toBeTypeOf('function');
    expect(api.DeterministicMockIntelligenceProvider).toBeTypeOf('function');
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) {
      throw new Error('Phase 3C orchestration API is unavailable');
    }
    const provider = new api.DeterministicMockIntelligenceProvider(scenarios);
    const result = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider,
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
        onAttemptDebug,
      } as unknown as Parameters<NonNullable<typeof api.orchestrateIntelligence>>[0]),
    );
    return result;
  }

  it('fires once per successful attempt with full validation detail (path + message)', async () => {
    const seen: DebugAttempt[] = [];
    const result = await orchestrateWithDebug(['unknown_evidence_id', 'valid'], (attempt) =>
      seen.push(attempt),
    );

    expect(result.status).toBe('llm_success');
    expect(seen).toHaveLength(2);
    expect(seen[0]!.attemptNumber).toBe(1);
    expect(seen[0]!.kind).toBe('initial');
    expect(seen[0]!.validation.status).not.toBe('passed');
    expect(seen[0]!.validation.errors.length).toBeGreaterThan(0);
    for (const error of seen[0]!.validation.errors) {
      const typed = error as { code: string; path: unknown[]; message: string };
      expect(typeof typed.code).toBe('string');
      expect(Array.isArray(typed.path)).toBe(true);
      expect(typeof typed.message).toBe('string');
    }
    expect(seen[1]!.attemptNumber).toBe(2);
    expect(seen[1]!.retryReason).toBe('validation_repair');
    expect(seen[1]!.validation.status).toBe('passed');
    expect(seen[0]!.rawOutput).not.toEqual(seen[1]!.rawOutput);
  });

  it('does not fire for a transport failure that produced no model output', async () => {
    const seen: DebugAttempt[] = [];
    const result = await orchestrateWithDebug(['timeout', 'valid'], (attempt) => seen.push(attempt));

    expect(result.status).toBe('llm_success');
    // Only the successful transport-retry attempt fires; the timed-out first attempt never does.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.attemptNumber).toBe(2);
    expect(seen[0]!.retryReason).toBe('transport');
  });

  it('never fires when omitted, and a throwing hook cannot alter the orchestration result', async () => {
    const api = ai as unknown as OrchestrationApi;
    const { context, currentSignals } = fixture();
    if (!api.orchestrateIntelligence || !api.DeterministicMockIntelligenceProvider) {
      throw new Error('Phase 3C orchestration API is unavailable');
    }

    const baseline = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider: new api.DeterministicMockIntelligenceProvider(['unknown_evidence_id', 'valid']),
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
      }),
    );

    const withThrowingHook = record(
      await api.orchestrateIntelligence({
        context,
        contextHash: intelligenceContextHash(context),
        provider: new api.DeterministicMockIntelligenceProvider(['unknown_evidence_id', 'valid']),
        promptVersion: 'phase-3c-test',
        systemPrompt: 'Return the requested structured intelligence synthesis.',
        deterministicFallback: deterministicFallback(currentSignals),
        onAttemptDebug: () => {
          throw new Error('debug hook must never affect orchestration');
        },
      } as unknown as Parameters<NonNullable<typeof api.orchestrateIntelligence>>[0]),
    );

    expect(withThrowingHook).toEqual(baseline);
    expect(withThrowingHook).not.toHaveProperty('rawOutput');
  });
});
