import 'server-only';

import {
  prepareIntelligenceGenerationPersistence,
  type IntelligencePersistenceRejectionCode,
} from '@rivallens/intelligence';
import {
  llmIntelligencePersistenceResultSchema,
  type LlmIntelligencePersistencePayload,
  type LlmIntelligencePersistenceResult,
} from '@rivallens/schemas';

export type PersistLlmIntelligenceGenerationResult =
  | { status: 'persisted'; result: LlmIntelligencePersistenceResult }
  | {
      status: 'rejected';
      code: IntelligencePersistenceRejectionCode;
      issues: ReadonlyArray<{ path: Array<string | number>; message: string }>;
    };

export function verifyPersistedLlmIntelligence(
  payload: LlmIntelligencePersistencePayload,
  rpcResult: unknown,
): LlmIntelligencePersistenceResult {
  const result = llmIntelligencePersistenceResultSchema.parse(rpcResult);
  const expectedExperiments = payload.experiments.map((experiment, position) => ({
    position,
    hypothesisRef: experiment.hypothesisRef,
  }));
  if (
    result.generationRunId !== payload.generationRunId ||
    result.outcome !== payload.outcome ||
    result.hypotheses.map((hypothesis) => hypothesis.ref).join(',') !==
      payload.hypotheses.map((hypothesis) => hypothesis.ref).join(',') ||
    new Set(result.hypotheses.map((hypothesis) => hypothesis.id)).size !==
      result.hypotheses.length ||
    result.experiments.length !== expectedExperiments.length ||
    result.experiments.some(
      (experiment, index) =>
        experiment.position !== expectedExperiments[index]!.position ||
        experiment.hypothesisRef !== expectedExperiments[index]!.hypothesisRef,
    ) ||
    (result.executiveBriefingId !== null) !== (payload.executiveBriefing !== null)
  ) {
    throw new Error('LLM intelligence persistence returned a mismatched result.');
  }
  return result;
}

/**
 * Internal, service-role persistence of one LLM generation run. Callers must already have
 * authorized the brand with the RLS-aware client. Re-validation against the frozen context
 * happens here, before any database access; rejected input never reaches the database.
 */
export async function persistLlmIntelligenceGeneration(
  input: unknown,
): Promise<PersistLlmIntelligenceGenerationResult> {
  const prepared = prepareIntelligenceGenerationPersistence(input);
  if (prepared.status === 'rejected') {
    return { status: 'rejected', code: prepared.code, issues: prepared.issues };
  }

  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_llm_intelligence_generation', {
    p_generation: prepared.payload,
  });
  if (error) throw new Error(error.message);

  return {
    status: 'persisted',
    result: verifyPersistedLlmIntelligence(prepared.payload, data),
  };
}
