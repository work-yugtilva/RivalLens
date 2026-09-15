import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeterministicMockIntelligenceProvider,
  type DeterministicMockScenario,
  type DeterministicMockSequence,
  type IntelligenceModelProvider,
} from '../../packages/ai/src';
import {
  composeCompetitiveIntelligenceReport,
  prepareIntelligenceGenerationPersistence,
} from '../../packages/intelligence/src';
import type {
  LlmIntelligencePersistencePayload,
  LlmIntelligencePersistenceResult,
} from '../../packages/schemas/src';
import { GENERATED_AT, reportInput, uuid } from './fixtures/competitive-reports';

const mocks = vi.hoisted(() => ({
  loadSource: vi.fn(),
  loadChanges: vi.fn(),
  loadAccepted: vi.fn(),
  persistV1: vi.fn(),
  persistV2: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@rivallens/ai/server', async () => {
  const orchestration = await import('../../packages/ai/src/orchestration');
  return { orchestrateIntelligenceForPersistence: orchestration.orchestrateIntelligenceTrusted };
});
vi.mock('../../apps/web/src/lib/internal/competitive-reports', () => ({
  loadAuthorizedCompetitiveReportSourceState: mocks.loadSource,
  persistDeterministicCompetitiveReport: mocks.persistV1,
  persistLlmCompetitiveReport: mocks.persistV2,
}));
vi.mock('../../apps/web/src/lib/internal/competitive-signals', () => ({
  loadRecentObservedChanges: mocks.loadChanges,
  enrichObservedChanges: ({ observedChanges }: { observedChanges: unknown[] }) => observedChanges,
}));
vi.mock('../../apps/web/src/lib/internal/llm-intelligence-read', () => ({
  loadAcceptedLlmIntelligenceForReport: mocks.loadAccepted,
}));
vi.mock('../../apps/web/src/lib/internal/llm-intelligence-persistence', () => ({
  persistLlmIntelligenceGeneration: vi.fn(),
}));

import { generateCompetitiveIntelligenceReport } from '../../apps/web/src/lib/internal/llm-report-runtime';
import {
  PRODUCTION_PROVIDER_DESCRIPTORS,
  type ProductionProviderId,
  type ProductionProviderSelection,
} from '../../apps/web/src/lib/internal/llm-provider-policy';

function sourceState() {
  const input = reportInput();
  return {
    comparison: input.comparison,
    subjectsEvidence: [],
    signalProjection: input.signalProjection,
    currentSignals: input.currentSignals,
    hypothesisProjection: input.hypothesisProjection,
    experimentProjection: input.experimentProjection,
    deterministicCandidate: composeCompetitiveIntelligenceReport(input),
  };
}

function pinnedProvider(
  providerId: ProductionProviderId,
  scenario: DeterministicMockScenario | DeterministicMockSequence,
) {
  const inner = new DeterministicMockIntelligenceProvider(scenario);
  const descriptor = PRODUCTION_PROVIDER_DESCRIPTORS[providerId];
  const provider: IntelligenceModelProvider = {
    providerId,
    modelId: descriptor.modelId,
    async generateStructured(request) {
      const response = await inner.generateStructured(request);
      return {
        ...response,
        telemetry: { ...response.telemetry, providerId, modelId: descriptor.modelId },
      };
    },
  };
  return { descriptor, provider, calls: () => inner.calls };
}

function selection(
  primary: ReturnType<typeof pinnedProvider>,
  secondary?: ReturnType<typeof pinnedProvider>,
): ProductionProviderSelection {
  return {
    status: 'ready',
    primary: { descriptor: primary.descriptor, provider: primary.provider },
    ...(secondary
      ? { secondary: { descriptor: secondary.descriptor, provider: secondary.provider } }
      : {}),
  };
}

function persistenceResult(payload: LlmIntelligencePersistencePayload): LlmIntelligencePersistenceResult {
  return {
    generationRunId: payload.generationRunId,
    outcome: payload.outcome,
    hypotheses: payload.hypotheses.map((hypothesis, index) => ({
      ref: hypothesis.ref,
      id: uuid(700 + index),
    })),
    experiments: payload.experiments.map((experiment, position) => ({
      position,
      hypothesisRef: experiment.hypothesisRef,
      id: uuid(800 + position),
    })),
    executiveBriefingId: payload.executiveBriefing ? uuid(900) : null,
  };
}

describe('production LLM report runtime', () => {
  let persistedPayloads: LlmIntelligencePersistencePayload[];

  beforeEach(() => {
    persistedPayloads = [];
    const source = sourceState();
    mocks.loadSource.mockReset().mockResolvedValue({ status: 'ok', value: source });
    mocks.loadChanges.mockReset().mockResolvedValue([]);
    mocks.persistV1.mockReset().mockImplementation(async (candidate) => ({ ...candidate, id: uuid(950) }));
    mocks.persistV2
      .mockReset()
      .mockImplementation(async (candidate) => ({
        ...candidate,
        id: uuid(951),
      }));
    mocks.loadAccepted.mockReset().mockImplementation(async (_supabase, input) => {
      const payload = persistedPayloads.find(
        (candidate) => candidate.generationRunId === input.generationRunId,
      );
      if (!payload?.executiveBriefing) throw new Error('Expected accepted persisted intelligence.');
      const result = persistenceResult(payload);
      const hypothesisIds = new Map(result.hypotheses.map((row) => [row.ref, row.id]));
      return {
        hypotheses: payload.hypotheses.map((hypothesis) => ({
          ...hypothesis,
          id: hypothesisIds.get(hypothesis.ref)!,
        })),
        experiments: payload.experiments.map((experiment, index) => ({
          ...experiment,
          id: result.experiments[index]!.id,
          hypothesisId: hypothesisIds.get(experiment.hypothesisRef)!,
        })),
        executiveBriefing: {
          ...payload.executiveBriefing,
          id: result.executiveBriefingId!,
          supportingHypothesisIds: payload.executiveBriefing.supportingHypothesisRefs.map(
            (ref) => hypothesisIds.get(ref)!,
          ),
        },
      };
    });
  });

  function persistGeneration(input: unknown) {
    const prepared = prepareIntelligenceGenerationPersistence(input);
    if (prepared.status !== 'ready') throw new Error(`Unexpected rejection: ${prepared.code}`);
    persistedPayloads.push(prepared.payload);
    return Promise.resolve({ status: 'persisted' as const, result: persistenceResult(prepared.payload) });
  }

  it('authorizes the complete scope before provider selection or persistence', async () => {
    const resolveProviders = vi.fn();
    const persist = vi.fn(persistGeneration);
    mocks.loadSource.mockResolvedValue({ status: 'competitors_not_found' });

    await expect(
      generateCompetitiveIntelligenceReport({} as never, {
        brandId: uuid(1),
        competitorIds: [uuid(999)],
        generatedAt: GENERATED_AT,
      }, { resolveProviders, persistGeneration: persist }),
    ).resolves.toEqual({ status: 'competitors_not_found' });

    expect(resolveProviders).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(mocks.persistV1).not.toHaveBeenCalled();
    expect(mocks.persistV2).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'disabled' as const },
    { status: 'configuration_unavailable' as const, primaryProviderId: 'anthropic' as const },
  ])('uses v1 without fabricating a run when provider selection is $status', async (providerSelection) => {
    const persist = vi.fn(persistGeneration);

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      {
        brandId: reportInput().comparison.brandId,
        competitorIds: [uuid(2)],
        generatedAt: GENERATED_AT,
      },
      { resolveProviders: () => providerSelection, persistGeneration: persist },
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.report.reportEngineVersion).toBe('competitive-report-v1');
    expect(persist).not.toHaveBeenCalled();
    expect(mocks.persistV1).toHaveBeenCalledOnce();
    expect(mocks.persistV2).not.toHaveBeenCalled();
  });

  it('hands the exact frozen context and accepted provider provenance through Phase 5', async () => {
    const primary = pinnedProvider('anthropic', 'valid');
    const runId = uuid(600);

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      { brandId: reportInput().comparison.brandId, competitorIds: [uuid(2)], generatedAt: GENERATED_AT },
      {
        resolveProviders: () => selection(primary),
        persistGeneration,
        createGenerationRunId: () => runId,
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.report.reportEngineVersion).toBe('competitive-report-v2-llm');
    expect(result.report).not.toHaveProperty('generationRunId');
    expect(primary.calls()).toBe(1);
    expect(persistedPayloads).toHaveLength(1);
    expect(persistedPayloads[0]).toMatchObject({
      generationRunId: runId,
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      outcome: 'llm_success',
      attempts: [{ rawOutputCaptured: true }],
    });
    expect(persistedPayloads[0]!.intelligenceContextHash).toBe(result.report.sourceStateHash);
    expect(mocks.loadAccepted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ generationRunId: runId }),
    );
    expect(mocks.persistV2).toHaveBeenCalledWith(expect.anything(), runId);
  });

  it('finalizes accepted partial intelligence without filling it from deterministic rows', async () => {
    const primary = pinnedProvider('anthropic', 'partial_stable_refs');

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      {
        brandId: reportInput().comparison.brandId,
        competitorIds: [uuid(2)],
        generatedAt: GENERATED_AT,
      },
      {
        resolveProviders: () => selection(primary),
        persistGeneration,
        createGenerationRunId: () => uuid(605),
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.report.reportEngineVersion).toBe('competitive-report-v2-llm');
    if (result.report.reportEngineVersion !== 'competitive-report-v2-llm') return;
    expect(result.report.generation).toEqual({ result: 'llm_partial' });
    expect(result.report.completeness.state).toBe('partial');
    expect(result.report.sections.appearsToBeWorking).toHaveLength(1);
    expect(result.report.sections.whatToTestNext).toHaveLength(1);
    expect(result.report.sourceIntelligence.hypothesisIds).toEqual([
      persistenceResult(persistedPayloads[0]!).hypotheses[0]!.id,
    ]);
    expect(mocks.persistV1).not.toHaveBeenCalled();
  });

  it('persists an eligible failed primary run, then accepts one separate secondary run', async () => {
    const primary = pinnedProvider('anthropic', ['timeout', 'timeout']);
    const secondary = pinnedProvider('gemini', 'valid');
    const runIds = [uuid(610), uuid(611)];

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      { brandId: reportInput().comparison.brandId, competitorIds: [uuid(2)], generatedAt: GENERATED_AT },
      {
        resolveProviders: () => selection(primary, secondary),
        persistGeneration,
        createGenerationRunId: () => runIds.shift()!,
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.report.reportEngineVersion).toBe('competitive-report-v2-llm');
    expect(primary.calls()).toBe(2);
    expect(secondary.calls()).toBe(1);
    expect(persistedPayloads.map(({ generationRunId, providerId, outcome }) => ({ generationRunId, providerId, outcome }))).toEqual([
      { generationRunId: uuid(610), providerId: 'anthropic', outcome: 'deterministic_fallback' },
      { generationRunId: uuid(611), providerId: 'gemini', outcome: 'llm_success' },
    ]);
    expect(persistedPayloads[0]!.intelligenceContext).toEqual(persistedPayloads[1]!.intelligenceContext);
    expect(mocks.persistV2).toHaveBeenCalledWith(expect.anything(), uuid(611));
  });

  it('supports the reverse Gemini-to-Sonnet failover order', async () => {
    const primary = pinnedProvider('gemini', ['timeout', 'timeout']);
    const secondary = pinnedProvider('anthropic', 'valid');
    const runIds = [uuid(612), uuid(613)];

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      {
        brandId: reportInput().comparison.brandId,
        competitorIds: [uuid(2)],
        generatedAt: GENERATED_AT,
      },
      {
        resolveProviders: () => selection(primary, secondary),
        persistGeneration,
        createGenerationRunId: () => runIds.shift()!,
      },
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.report.reportEngineVersion).toBe('competitive-report-v2-llm');
    expect(primary.calls()).toBe(2);
    expect(secondary.calls()).toBe(1);
    expect(persistedPayloads.map(({ providerId, outcome }) => ({ providerId, outcome }))).toEqual([
      { providerId: 'gemini', outcome: 'deterministic_fallback' },
      { providerId: 'anthropic', outcome: 'llm_success' },
    ]);
  });

  it('bounds complete eligible exhaustion at four calls and returns unchanged v1', async () => {
    const primary = pinnedProvider('gemini', ['timeout', 'timeout']);
    const secondary = pinnedProvider('anthropic', ['timeout', 'timeout']);
    const runIds = [uuid(620), uuid(621)];

    const result = await generateCompetitiveIntelligenceReport(
      {} as never,
      { brandId: reportInput().comparison.brandId, competitorIds: [uuid(2)], generatedAt: GENERATED_AT },
      {
        resolveProviders: () => selection(primary, secondary),
        persistGeneration,
        createGenerationRunId: () => runIds.shift()!,
      },
    );

    expect(primary.calls() + secondary.calls()).toBe(4);
    expect(persistedPayloads).toHaveLength(2);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.report.reportEngineVersion).toBe('competitive-report-v1');
    expect(mocks.persistV1).toHaveBeenCalledOnce();
    expect(mocks.persistV2).not.toHaveBeenCalled();
  });

  it.each(['malformed_schema', 'provider_exception'] as const)(
    'does not cross-provider fail over for %s',
    async (scenario) => {
      const primary = pinnedProvider('anthropic', scenario);
      const secondary = pinnedProvider('gemini', 'valid');

      const result = await generateCompetitiveIntelligenceReport(
        {} as never,
        { brandId: reportInput().comparison.brandId, competitorIds: [uuid(2)], generatedAt: GENERATED_AT },
        {
          resolveProviders: () => selection(primary, secondary),
          persistGeneration,
          createGenerationRunId: () => uuid(630),
        },
      );

      expect(primary.calls()).toBe(1);
      expect(secondary.calls()).toBe(0);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.report.reportEngineVersion).toBe('competitive-report-v1');
      expect(persistedPayloads).toHaveLength(1);
    },
  );

  it('aborts report creation when Phase 5 rejects the generation', async () => {
    const primary = pinnedProvider('anthropic', 'valid');
    const rejected = vi.fn().mockResolvedValue({ status: 'rejected', code: 'INVALID_INPUT', issues: [] });
    await expect(
      generateCompetitiveIntelligenceReport(
        {} as never,
        { brandId: reportInput().comparison.brandId, competitorIds: [uuid(2)], generatedAt: GENERATED_AT },
        { resolveProviders: () => selection(primary), persistGeneration: rejected },
      ),
    ).rejects.toThrow('Phase 5 persistence rejected');
    expect(mocks.persistV1).not.toHaveBeenCalled();
    expect(mocks.persistV2).not.toHaveBeenCalled();
  });

  it('aborts report creation when Phase 5 disagrees with the orchestration outcome', async () => {
    const primary = pinnedProvider('anthropic', 'valid');
    const disagreeing = vi.fn(async (input: unknown) => {
      const prepared = prepareIntelligenceGenerationPersistence(input);
      if (prepared.status !== 'ready') throw new Error('Expected a valid persistence payload.');
      return {
        status: 'persisted' as const,
        result: {
          ...persistenceResult(prepared.payload),
          outcome: 'llm_partial' as const,
        },
      };
    });

    await expect(
      generateCompetitiveIntelligenceReport(
        {} as never,
        {
          brandId: reportInput().comparison.brandId,
          competitorIds: [uuid(2)],
          generatedAt: GENERATED_AT,
        },
        { resolveProviders: () => selection(primary), persistGeneration: disagreeing },
      ),
    ).rejects.toThrow('Phase 5 persistence disagreed');
    expect(mocks.persistV1).not.toHaveBeenCalled();
    expect(mocks.persistV2).not.toHaveBeenCalled();
  });
});
