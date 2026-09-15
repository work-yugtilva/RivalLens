import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeterministicMockIntelligenceProvider } from '../../packages/ai/src';
import {
  buildIntelligenceContext,
  intelligenceContextHash,
  prepareIntelligenceGenerationPersistence,
} from '../../packages/intelligence/src';
import type {
  LlmIntelligencePersistencePayload,
  LlmIntelligencePersistenceResult,
} from '../../packages/schemas/src';
import { BRAND_ID, GENERATED_AT, reportInput, uuid } from './fixtures/competitive-reports';

vi.mock('server-only', () => ({}));

import { loadAcceptedLlmIntelligenceForReport } from '../../apps/web/src/lib/internal/llm-intelligence-read';

const RUN_ID = uuid(600);
let payload: LlmIntelligencePersistencePayload;
let persistenceResult: LlmIntelligencePersistenceResult;

beforeAll(async () => {
  const input = reportInput();
  const context = buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const provider = new DeterministicMockIntelligenceProvider('valid');
  const response = await provider.generateStructured({
    promptVersion: 'intelligence-synthesis-v1',
    systemPrompt: 'Return structured intelligence.',
    context,
    contextHash: intelligenceContextHash(context),
    responseSchema: {} as never,
    schemaName: 'llm-intelligence-synthesis-v1',
  });
  const prepared = prepareIntelligenceGenerationPersistence({
    generationRunId: RUN_ID,
    context,
    contextHash: intelligenceContextHash(context),
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
  });
  if (prepared.status !== 'ready') throw new Error(`Unexpected rejection: ${prepared.code}`);
  payload = prepared.payload;
  persistenceResult = {
    generationRunId: RUN_ID,
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
    executiveBriefingId: uuid(900),
  };
});

function rows() {
  const hypothesisIds = new Map(persistenceResult.hypotheses.map((row) => [row.ref, row.id]));
  const hypotheses = payload.hypotheses.map((item) => ({
    id: hypothesisIds.get(item.ref),
    generation_run_id: RUN_ID,
    owned_brand_id: BRAND_ID,
    competitor_id: item.competitorId,
    hypothesis_ref: item.ref,
    theme: item.theme,
    statement: item.statement,
    rationale: item.rationale,
    confidence: item.confidence,
    uncertainty_category: item.uncertaintyCategory,
    uncertainty_statement: item.uncertaintyStatement,
    assumptions: item.assumptions,
    epistemic_class_dependencies: item.epistemicClassDependencies,
    supporting_signal_ids: item.supportingSignalIds,
    supporting_comparison_keys: item.supportingComparisonKeys,
    claim_references: item.claimReferences,
    numeric_claims: item.numericClaims,
    generated_at: GENERATED_AT,
    hypothesis_engine_version: item.hypothesisEngineVersion,
    generation_provenance: item.generationProvenance,
    hypothesis_hash: item.hypothesisHash,
  }));
  const experiments = payload.experiments.map((item, index) => ({
    id: persistenceResult.experiments[index]!.id,
    generation_run_id: RUN_ID,
    owned_brand_id: BRAND_ID,
    competitor_id: item.competitorId,
    hypothesis_id: hypothesisIds.get(item.hypothesisRef),
    source_hypothesis_ref: item.hypothesisRef,
    title: item.title,
    objective: item.objective,
    hypothesis_under_test: item.hypothesisUnderTest,
    variable_under_test: item.variableUnderTest,
    design: item.design,
    primary_metric: item.primaryMetric,
    guardrail_metrics: item.guardrailMetrics,
    implementation_notes: item.implementationNotes,
    caveat_category: item.caveatCategory,
    caveat_statement: item.caveatStatement,
    claim_references: item.claimReferences,
    numeric_claims: item.numericClaims,
    generated_at: GENERATED_AT,
    experiment_engine_version: item.experimentEngineVersion,
    generation_provenance: item.generationProvenance,
    experiment_hash: item.experimentHash,
  }));
  const briefing = payload.executiveBriefing!;
  const briefings = [{
    id: persistenceResult.executiveBriefingId,
    generation_run_id: RUN_ID,
    owned_brand_id: BRAND_ID,
    headline: briefing.headline,
    strategic_posture_summary: briefing.strategicPostureSummary,
    key_takeaway: briefing.keyTakeaway,
    supporting_hypothesis_refs: briefing.supportingHypothesisRefs,
    claim_references: briefing.claimReferences,
    numeric_claims: briefing.numericClaims,
    generated_at: GENERATED_AT,
    generation_provenance: briefing.generationProvenance,
  }];
  const links = briefing.supportingHypothesisRefs.map((ref, position) => ({
    briefing_id: persistenceResult.executiveBriefingId,
    generation_run_id: RUN_ID,
    position,
    hypothesis_id: hypothesisIds.get(ref),
    hypothesis_ref: ref,
  }));
  return {
    llm_strategic_hypotheses: hypotheses,
    llm_recommended_experiments: experiments,
    llm_executive_briefings: briefings,
    llm_executive_briefing_hypotheses: links,
  };
}

function client(tables: ReturnType<typeof rows>) {
  const reads: string[] = [];
  return {
    reads,
    supabase: {
      from(table: keyof typeof tables) {
        reads.push(table);
        const data = tables[table];
        const result = () => Promise.resolve({ data, error: null });
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => result().then(resolve),
        };
        return query;
      },
    },
  };
}

describe('accepted LLM customer-table readback', () => {
  it('loads only accepted llm_* rows and preserves evidence lineage', async () => {
    const database = client(rows());
    const result = await loadAcceptedLlmIntelligenceForReport(database.supabase as never, {
      brandId: BRAND_ID,
      generationRunId: RUN_ID,
      persistenceResult,
    });

    expect(result.hypotheses.map(({ id }) => id)).toEqual(
      persistenceResult.hypotheses.map(({ id }) => id),
    );
    expect(result.experiments[0]!.hypothesisId).toBe(result.hypotheses[0]!.id);
    expect(result.executiveBriefing.supportingHypothesisIds).toEqual([result.hypotheses[0]!.id]);
    expect(database.reads).toEqual([
      'llm_strategic_hypotheses',
      'llm_recommended_experiments',
      'llm_executive_briefings',
      'llm_executive_briefing_hypotheses',
    ]);
    expect(JSON.stringify(result)).not.toContain('raw_output');
    expect(JSON.stringify(result)).not.toContain('intelligence_context');
  });

  it('rejects rows outside the authorized brand or generation', async () => {
    const tables = rows();
    tables.llm_strategic_hypotheses[0]!.generation_run_id = uuid(999);
    await expect(
      loadAcceptedLlmIntelligenceForReport(client(tables).supabase as never, {
        brandId: BRAND_ID,
        generationRunId: RUN_ID,
        persistenceResult,
      }),
    ).rejects.toThrow('crossed its authorized generation scope');
  });

  it('rejects briefing junctions that disagree with persisted stable refs', async () => {
    const tables = rows();
    tables.llm_executive_briefing_hypotheses[0]!.hypothesis_ref = 'h9';
    await expect(
      loadAcceptedLlmIntelligenceForReport(client(tables).supabase as never, {
        brandId: BRAND_ID,
        generationRunId: RUN_ID,
        persistenceResult,
      }),
    ).rejects.toThrow('junction row');
  });
});
