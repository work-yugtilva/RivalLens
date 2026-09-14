import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeterministicMockIntelligenceProvider } from '../../packages/ai/src';
import {
  buildIntelligenceContext,
  intelligenceContextHash,
  prepareIntelligenceGenerationPersistence,
} from '../../packages/intelligence/src';
import {
  llmIntelligenceSynthesisOutputSchema,
  type IntelligenceContext,
  type LlmIntelligencePersistencePayload,
} from '../../packages/schemas/src';
import { GENERATED_AT, reportInput } from './fixtures/competitive-reports';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../apps/web/src/lib/internal/supabase-admin', () => ({
  createInternalSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

import {
  persistLlmIntelligenceGeneration,
  verifyPersistedLlmIntelligence,
} from '../../apps/web/src/lib/internal/llm-intelligence-persistence';

const RUN_ID = '9a9a9a9a-0000-4000-8000-000000000002';

async function persistenceInput(contextHash?: string) {
  const input = reportInput();
  const context: IntelligenceContext = buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const provider = new DeterministicMockIntelligenceProvider('valid');
  const response = await provider.generateStructured({
    promptVersion: 'intelligence-synthesis-v1',
    systemPrompt: 'test',
    context,
    contextHash: intelligenceContextHash(context),
    responseSchema: llmIntelligenceSynthesisOutputSchema,
    schemaName: 'llm-intelligence-synthesis-v1',
  });
  return {
    generationRunId: RUN_ID,
    context,
    contextHash: contextHash ?? intelligenceContextHash(context),
    promptVersion: 'intelligence-synthesis-v1',
    providerId: provider.providerId,
    modelId: provider.modelId,
    parameters: {},
    attempts: [
      {
        attemptNumber: 1,
        kind: 'initial',
        promptVersion: 'intelligence-synthesis-v1',
        telemetry: response.telemetry,
        rawOutput: { value: response.rawOutput },
      },
    ],
    generationOutcome: { kind: 'llm_candidate' },
  };
}

function rpcResult(payload: LlmIntelligencePersistencePayload) {
  return {
    generationRunId: payload.generationRunId,
    outcome: payload.outcome,
    hypotheses: payload.hypotheses.map((hypothesis, index) => ({
      ref: hypothesis.ref,
      id: `aaaaaaaa-0000-4000-8000-00000000000${index}`,
    })),
    experiments: payload.experiments.map((experiment, position) => ({
      position,
      hypothesisRef: experiment.hypothesisRef,
      id: `bbbbbbbb-0000-4000-8000-00000000000${position}`,
    })),
    executiveBriefingId: payload.executiveBriefing ? 'cccccccc-0000-4000-8000-000000000000' : null,
  };
}

describe('persistLlmIntelligenceGeneration', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('never reaches the database when the boundary rejects the input', async () => {
    const result = await persistLlmIntelligenceGeneration(
      await persistenceInput(`sha256:${'0'.repeat(64)}`),
    );

    expect(result).toMatchObject({ status: 'rejected', code: 'CONTEXT_HASH_MISMATCH' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('sends exactly the revalidated payload to the transactional RPC', async () => {
    const input = await persistenceInput();
    const prepared = prepareIntelligenceGenerationPersistence(input);
    if (prepared.status !== 'ready') throw new Error('expected ready payload');
    mocks.rpc.mockResolvedValue({ data: rpcResult(prepared.payload), error: null });

    const result = await persistLlmIntelligenceGeneration(input);

    expect(mocks.rpc).toHaveBeenCalledWith('persist_llm_intelligence_generation', {
      p_generation: prepared.payload,
    });
    expect(result).toMatchObject({ status: 'persisted', result: { outcome: 'llm_success' } });
  });

  it('surfaces database errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'tenant scope violation' } });

    await expect(persistLlmIntelligenceGeneration(await persistenceInput())).rejects.toThrow(
      'tenant scope violation',
    );
  });

  it('rejects an RPC result that does not match the persisted payload', async () => {
    const prepared = prepareIntelligenceGenerationPersistence(await persistenceInput());
    if (prepared.status !== 'ready') throw new Error('expected ready payload');
    const mismatched = rpcResult(prepared.payload);
    mismatched.experiments[0]!.hypothesisRef = 'h9';

    expect(() => verifyPersistedLlmIntelligence(prepared.payload, mismatched)).toThrow(
      'mismatched result',
    );
    expect(() =>
      verifyPersistedLlmIntelligence(prepared.payload, { ...rpcResult(prepared.payload), extra: 1 }),
    ).toThrow();
  });
});
