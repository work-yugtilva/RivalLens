import 'server-only';

import type {
  PersistedLlmReportBriefing,
  PersistedLlmReportExperiment,
  PersistedLlmReportHypothesis,
} from '@rivallens/intelligence';
import {
  llmGenerationProvenanceSchema,
  persistedLlmExecutiveBriefingPayloadSchema,
  persistedLlmExperimentPayloadSchema,
  persistedLlmHypothesisPayloadSchema,
  type LlmIntelligencePersistenceResult,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const hypothesisRowSchema = z
  .object({
    id: uuid,
    generation_run_id: uuid,
    owned_brand_id: uuid,
    competitor_id: uuid,
    hypothesis_ref: z.string(),
    theme: z.string(),
    statement: z.string(),
    rationale: z.string(),
    confidence: z.string(),
    uncertainty_category: z.string(),
    uncertainty_statement: z.string(),
    assumptions: z.unknown(),
    epistemic_class_dependencies: z.array(z.string()),
    supporting_signal_ids: z.array(uuid),
    supporting_comparison_keys: z.array(z.string()),
    claim_references: z.unknown(),
    numeric_claims: z.unknown(),
    generated_at: timestamp,
    hypothesis_engine_version: z.string(),
    generation_provenance: llmGenerationProvenanceSchema,
    hypothesis_hash: hash,
  })
  .strict();

const experimentRowSchema = z
  .object({
    id: uuid,
    generation_run_id: uuid,
    owned_brand_id: uuid,
    competitor_id: uuid,
    hypothesis_id: uuid,
    source_hypothesis_ref: z.string(),
    title: z.string(),
    objective: z.string(),
    hypothesis_under_test: z.string(),
    variable_under_test: z.string(),
    design: z.unknown(),
    primary_metric: z.string(),
    guardrail_metrics: z.array(z.string()),
    implementation_notes: z.unknown(),
    caveat_category: z.string(),
    caveat_statement: z.string(),
    claim_references: z.unknown(),
    numeric_claims: z.unknown(),
    generated_at: timestamp,
    experiment_engine_version: z.string(),
    generation_provenance: llmGenerationProvenanceSchema,
    experiment_hash: hash,
  })
  .strict();

const briefingRowSchema = z
  .object({
    id: uuid,
    generation_run_id: uuid,
    owned_brand_id: uuid,
    headline: z.string(),
    strategic_posture_summary: z.string(),
    key_takeaway: z.string(),
    supporting_hypothesis_refs: z.array(z.string()),
    claim_references: z.unknown(),
    numeric_claims: z.unknown(),
    generated_at: timestamp,
    generation_provenance: llmGenerationProvenanceSchema,
  })
  .strict();

const briefingLinkSchema = z
  .object({
    briefing_id: uuid,
    generation_run_id: uuid,
    position: z.number().int().nonnegative(),
    hypothesis_id: uuid,
    hypothesis_ref: z.string(),
  })
  .strict();

function exactIds(actual: readonly string[], expected: readonly string[], label: string) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`LLM ${label} readback did not match the Phase 5 persistence result.`);
  }
}

export async function loadAcceptedLlmIntelligenceForReport(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    generationRunId: string;
    persistenceResult: LlmIntelligencePersistenceResult;
  },
): Promise<{
  hypotheses: PersistedLlmReportHypothesis[];
  experiments: PersistedLlmReportExperiment[];
  executiveBriefing: PersistedLlmReportBriefing;
}> {
  if (input.persistenceResult.generationRunId !== input.generationRunId) {
    throw new Error('LLM persistence result generation identity mismatch.');
  }
  const [hypothesesResult, experimentsResult, briefingResult] = await Promise.all([
    supabase
      .from('llm_strategic_hypotheses')
      .select(
        'id, generation_run_id, owned_brand_id, competitor_id, hypothesis_ref, theme, statement, rationale, confidence, uncertainty_category, uncertainty_statement, assumptions, epistemic_class_dependencies, supporting_signal_ids, supporting_comparison_keys, claim_references, numeric_claims, generated_at, hypothesis_engine_version, generation_provenance, hypothesis_hash',
      )
      .eq('owned_brand_id', input.brandId)
      .eq('generation_run_id', input.generationRunId)
      .order('hypothesis_ref', { ascending: true }),
    supabase
      .from('llm_recommended_experiments')
      .select(
        'id, generation_run_id, owned_brand_id, competitor_id, hypothesis_id, source_hypothesis_ref, title, objective, hypothesis_under_test, variable_under_test, design, primary_metric, guardrail_metrics, implementation_notes, caveat_category, caveat_statement, claim_references, numeric_claims, generated_at, experiment_engine_version, generation_provenance, experiment_hash',
      )
      .eq('owned_brand_id', input.brandId)
      .eq('generation_run_id', input.generationRunId)
      .order('id', { ascending: true }),
    supabase
      .from('llm_executive_briefings')
      .select(
        'id, generation_run_id, owned_brand_id, headline, strategic_posture_summary, key_takeaway, supporting_hypothesis_refs, claim_references, numeric_claims, generated_at, generation_provenance',
      )
      .eq('owned_brand_id', input.brandId)
      .eq('generation_run_id', input.generationRunId)
      .maybeSingle(),
  ]);
  if (hypothesesResult.error) throw new Error(hypothesesResult.error.message);
  if (experimentsResult.error) throw new Error(experimentsResult.error.message);
  if (briefingResult.error) throw new Error(briefingResult.error.message);

  const hypothesisRows = z.array(hypothesisRowSchema).parse(hypothesesResult.data ?? []);
  const experimentRows = z.array(experimentRowSchema).parse(experimentsResult.data ?? []);
  const briefingRow = briefingRowSchema.parse(briefingResult.data);
  if (
    [...hypothesisRows, ...experimentRows].some(
      (row) =>
        row.owned_brand_id !== input.brandId || row.generation_run_id !== input.generationRunId,
    ) ||
    briefingRow.owned_brand_id !== input.brandId ||
    briefingRow.generation_run_id !== input.generationRunId
  ) {
    throw new Error('LLM customer intelligence readback crossed its authorized generation scope.');
  }
  exactIds(
    hypothesisRows.map((row) => row.id),
    input.persistenceResult.hypotheses.map((row) => row.id),
    'hypothesis',
  );
  exactIds(
    experimentRows.map((row) => row.id),
    input.persistenceResult.experiments.map((row) => row.id),
    'experiment',
  );
  if (briefingRow.id !== input.persistenceResult.executiveBriefingId) {
    throw new Error('LLM briefing readback did not match the Phase 5 persistence result.');
  }

  const { data: linkData, error: linkError } = await supabase
    .from('llm_executive_briefing_hypotheses')
    .select('briefing_id, generation_run_id, position, hypothesis_id, hypothesis_ref')
    .eq('briefing_id', briefingRow.id)
    .eq('generation_run_id', input.generationRunId)
    .order('position', { ascending: true });
  if (linkError) throw new Error(linkError.message);
  const links = z.array(briefingLinkSchema).parse(linkData ?? []);
  if (
    links.some(
      (link) =>
        link.briefing_id !== briefingRow.id || link.generation_run_id !== input.generationRunId,
    ) ||
    new Set(links.map((link) => link.position)).size !== links.length ||
    new Set(links.map((link) => link.hypothesis_id)).size !== links.length
  ) {
    throw new Error('LLM briefing readback contained invalid lineage.');
  }

  const hypotheses = hypothesisRows.map((row) => ({
    id: row.id,
    ...persistedLlmHypothesisPayloadSchema.parse({
      ref: row.hypothesis_ref,
      competitorId: row.competitor_id,
      theme: row.theme,
      statement: row.statement,
      rationale: row.rationale,
      confidence: row.confidence,
      uncertaintyCategory: row.uncertainty_category,
      uncertaintyStatement: row.uncertainty_statement,
      assumptions: row.assumptions,
      epistemicClassDependencies: row.epistemic_class_dependencies,
      supportingSignalIds: row.supporting_signal_ids,
      supportingComparisonKeys: row.supporting_comparison_keys,
      claimReferences: row.claim_references,
      numericClaims: row.numeric_claims,
      hypothesisEngineVersion: row.hypothesis_engine_version,
      generationProvenance: row.generation_provenance,
      hypothesisHash: row.hypothesis_hash,
    }),
  }));
  const experiments = experimentRows.map((row) => ({
    id: row.id,
    hypothesisId: row.hypothesis_id,
    ...persistedLlmExperimentPayloadSchema.parse({
      hypothesisRef: row.source_hypothesis_ref,
      competitorId: row.competitor_id,
      title: row.title,
      objective: row.objective,
      hypothesisUnderTest: row.hypothesis_under_test,
      variableUnderTest: row.variable_under_test,
      design: row.design,
      primaryMetric: row.primary_metric,
      guardrailMetrics: row.guardrail_metrics,
      implementationNotes: row.implementation_notes,
      caveatCategory: row.caveat_category,
      caveatStatement: row.caveat_statement,
      claimReferences: row.claim_references,
      numericClaims: row.numeric_claims,
      experimentEngineVersion: row.experiment_engine_version,
      generationProvenance: row.generation_provenance,
      experimentHash: row.experiment_hash,
    }),
  }));
  const executiveBriefing = {
    id: briefingRow.id,
    supportingHypothesisIds: links.map((link) => link.hypothesis_id),
    ...persistedLlmExecutiveBriefingPayloadSchema.parse({
      headline: briefingRow.headline,
      strategicPostureSummary: briefingRow.strategic_posture_summary,
      keyTakeaway: briefingRow.key_takeaway,
      supportingHypothesisRefs: briefingRow.supporting_hypothesis_refs,
      claimReferences: briefingRow.claim_references,
      numericClaims: briefingRow.numeric_claims,
      generationProvenance: briefingRow.generation_provenance,
    }),
  };
  const hypothesisRefsById = new Map(
    hypotheses.map((hypothesis) => [hypothesis.id, hypothesis.ref]),
  );
  const linkedHypothesisRefs = executiveBriefing.supportingHypothesisIds.map((hypothesisId) => {
    const hypothesisRef = hypothesisRefsById.get(hypothesisId);
    if (!hypothesisRef) throw new Error('Executive briefing references an unavailable hypothesis.');
    return hypothesisRef;
  });
  exactIds(
    linkedHypothesisRefs,
    executiveBriefing.supportingHypothesisRefs,
    'briefing hypothesis reference',
  );
  if (links.some((link, index) => link.hypothesis_ref !== linkedHypothesisRefs[index])) {
    throw new Error('LLM briefing reference readback did not match its persisted junction row.');
  }
  return { hypotheses, experiments, executiveBriefing };
}
