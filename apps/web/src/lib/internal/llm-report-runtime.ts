import 'server-only';

import { randomUUID } from 'node:crypto';
import type { IntelligenceModelProvider } from '@rivallens/ai';
import { orchestrateIntelligenceForPersistence } from '@rivallens/ai/server';
import {
  buildIntelligenceContext,
  composeLlmCompetitiveIntelligenceReport,
  intelligenceContextHash,
  INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
  INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
} from '@rivallens/intelligence';
import type {
  CompetitiveReportAny,
  LlmIntelligencePersistenceResult,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadAuthorizedCompetitiveReportSourceState,
  persistDeterministicCompetitiveReport,
  persistLlmCompetitiveReport,
  type AuthorizedCompetitiveReportSourceState,
  type ProductionCompetitiveReportGenerateResult,
} from './competitive-reports';
import { enrichObservedChanges, loadRecentObservedChanges } from './competitive-signals';
import { loadAcceptedLlmIntelligenceForReport } from './llm-intelligence-read';
import { persistLlmIntelligenceGeneration } from './llm-intelligence-persistence';
import {
  isCrossProviderFailoverEligible,
  resolveProductionProviderSelection,
  type ProductionProviderDescriptor,
  type ProductionProviderSelection,
} from './llm-provider-policy';

type RuntimeProvider = {
  readonly descriptor: ProductionProviderDescriptor;
  readonly provider: IntelligenceModelProvider;
};

export type LlmReportRuntimeDependencies = {
  readonly resolveProviders?: () => ProductionProviderSelection;
  readonly persistGeneration?: typeof persistLlmIntelligenceGeneration;
  readonly createGenerationRunId?: () => string;
};

type PersistedProviderRun = {
  readonly trusted: Awaited<ReturnType<typeof orchestrateIntelligenceForPersistence>>;
  readonly persistenceResult: LlmIntelligencePersistenceResult;
  readonly generationRunId: string;
};

async function runAndPersistProvider(input: {
  runtimeProvider: RuntimeProvider;
  context: ReturnType<typeof buildIntelligenceContext>;
  contextHash: string;
  source: AuthorizedCompetitiveReportSourceState;
  generatedAt: string;
  persistGeneration: typeof persistLlmIntelligenceGeneration;
  createGenerationRunId: () => string;
}): Promise<PersistedProviderRun> {
  if (
    input.runtimeProvider.provider.providerId !== input.runtimeProvider.descriptor.providerId ||
    input.runtimeProvider.provider.modelId !== input.runtimeProvider.descriptor.modelId
  ) {
    throw new Error('Production provider identity does not match its pinned descriptor.');
  }
  const trusted = await orchestrateIntelligenceForPersistence({
    context: input.context,
    contextHash: input.contextHash,
    provider: input.runtimeProvider.provider,
    promptVersion: INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
    systemPrompt: INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
    parameters: input.runtimeProvider.descriptor.parameters,
    deterministicFallback: {
      currentSignals: input.source.currentSignals,
      currentHypotheses: input.source.hypothesisProjection.hypotheses,
      generatedAt: input.generatedAt,
    },
  });
  if (!trusted.frozenContext || trusted.persistenceAttempts.length === 0) {
    throw new Error('Production orchestration completed without a persistable provider attempt.');
  }

  const generationRunId = input.createGenerationRunId();
  const persisted = await input.persistGeneration({
    generationRunId,
    context: trusted.frozenContext,
    contextHash: trusted.contextHash,
    promptVersion: trusted.promptVersion,
    providerId: trusted.providerId,
    modelId: trusted.modelId,
    parameters: trusted.parameters,
    attempts: [...trusted.persistenceAttempts],
    generationOutcome:
      trusted.result.status === 'deterministic_fallback'
        ? {
            kind: 'deterministic_fallback',
            fallbackReason: trusted.result.fallbackReason,
          }
        : { kind: 'llm_candidate' },
  });
  if (persisted.status !== 'persisted') {
    throw new Error(`Phase 5 persistence rejected production input: ${persisted.code}`);
  }
  const persistenceResult = persisted.result;
  const expectedOutcome = trusted.result.status;
  if (persistenceResult.outcome !== expectedOutcome) {
    throw new Error('Phase 5 persistence disagreed with the production orchestration result.');
  }
  return { trusted, persistenceResult, generationRunId };
}

export async function finalizePersistedLlmReport(input: {
  supabase: SupabaseClient;
  source: AuthorizedCompetitiveReportSourceState;
  persistedRun: PersistedProviderRun;
  generatedAt: string;
}): Promise<CompetitiveReportAny> {
  const result = input.persistedRun.trusted.result;
  if (result.status !== 'llm_success' && result.status !== 'llm_partial') {
    throw new Error('Only an accepted generation run can be finalized as an LLM report.');
  }
  const accepted = await loadAcceptedLlmIntelligenceForReport(input.supabase, {
    brandId: input.source.comparison.brandId,
    generationRunId: input.persistedRun.generationRunId,
    persistenceResult: input.persistedRun.persistenceResult,
  });
  const candidate = composeLlmCompetitiveIntelligenceReport({
    baseReport: input.source.deterministicCandidate,
    currentSignals: input.source.currentSignals,
    hypotheses: accepted.hypotheses,
    experiments: accepted.experiments,
    executiveBriefing: accepted.executiveBriefing,
    generation: {
      runId: input.persistedRun.generationRunId,
      outcome: result.status,
      contextHash: input.persistedRun.trusted.contextHash,
      promptVersion: input.persistedRun.trusted.promptVersion,
      providerId: input.persistedRun.trusted.providerId,
      modelId: input.persistedRun.trusted.modelId,
    },
    generatedAt: input.generatedAt,
  });
  return persistLlmCompetitiveReport(candidate, input.persistedRun.generationRunId);
}

export async function generateCompetitiveIntelligenceReport(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
  dependencies: LlmReportRuntimeDependencies = {},
): Promise<ProductionCompetitiveReportGenerateResult> {
  // This RLS-aware load is deliberately first. No provider or privileged client exists before it.
  const loaded = await loadAuthorizedCompetitiveReportSourceState(supabase, input);
  if (loaded.status !== 'ok') return loaded;

  const selection = (dependencies.resolveProviders ?? resolveProductionProviderSelection)();
  if (selection.status !== 'ready') {
    return {
      status: 'ok',
      report: await persistDeterministicCompetitiveReport(loaded.value.deterministicCandidate),
    };
  }

  const observedChanges = await loadRecentObservedChanges(supabase, {
    subjectsEvidence: loaded.value.subjectsEvidence,
    competitorIds: input.competitorIds,
  });
  const context = buildIntelligenceContext({
    comparison: loaded.value.comparison,
    signals: loaded.value.currentSignals,
    observedChanges: enrichObservedChanges({
      comparison: loaded.value.comparison,
      subjectsEvidence: loaded.value.subjectsEvidence,
      observedChanges,
    }),
    analysisObjective: 'general_overview',
    includeSnippets: false,
    generatedAt: input.generatedAt,
  });
  const contextHash = intelligenceContextHash(context);
  const persistGeneration = dependencies.persistGeneration ?? persistLlmIntelligenceGeneration;
  const createGenerationRunId = dependencies.createGenerationRunId ?? randomUUID;

  const primary = await runAndPersistProvider({
    runtimeProvider: selection.primary,
    context,
    contextHash,
    source: loaded.value,
    generatedAt: input.generatedAt,
    persistGeneration,
    createGenerationRunId,
  });
  if (primary.trusted.result.status !== 'deterministic_fallback') {
    return {
      status: 'ok',
      report: await finalizePersistedLlmReport({
        supabase,
        source: loaded.value,
        persistedRun: primary,
        generatedAt: input.generatedAt,
      }),
    };
  }

  if (selection.secondary && isCrossProviderFailoverEligible(primary.trusted.result)) {
    const secondary = await runAndPersistProvider({
      runtimeProvider: selection.secondary,
      context,
      contextHash,
      source: loaded.value,
      generatedAt: input.generatedAt,
      persistGeneration,
      createGenerationRunId,
    });
    if (secondary.trusted.result.status !== 'deterministic_fallback') {
      return {
        status: 'ok',
        report: await finalizePersistedLlmReport({
          supabase,
          source: loaded.value,
          persistedRun: secondary,
          generatedAt: input.generatedAt,
        }),
      };
    }
  }

  return {
    status: 'ok',
    report: await persistDeterministicCompetitiveReport(loaded.value.deterministicCandidate),
  };
}
