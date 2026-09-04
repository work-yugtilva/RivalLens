import 'server-only';

import {
  generateRecommendedExperiments as generateRecommendedExperimentCandidates,
  resolveCurrentRecommendedExperiments,
} from '@rivallens/intelligence';
import {
  recommendedExperimentCandidateSchema,
  recommendedExperimentSchema,
  type CurrentRecommendedExperimentsProjection,
  type CurrentStrategicHypothesesProjection,
  type CompetitiveSignal,
  type RecommendedExperiment,
  type RecommendedExperimentCandidate,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { loadHistoricalCompetitiveSignals } from './competitive-signals';
import { loadCurrentStrategicHypotheses } from './strategic-hypotheses';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });

const persistedExperimentRpcRowSchema = z
  .object({
    id: uuidSchema,
    experiment_hash: hashSchema,
    inserted: z.boolean(),
  })
  .strict();

const persistedExperimentRowSchema = z
  .object({
    id: uuidSchema,
    owned_brand_id: uuidSchema,
    competitor_id: uuidSchema,
    experiment_type: z.string().min(1),
    title: z.string().min(1),
    objective: z.string().min(1),
    hypothesis_under_test: z.string().min(1),
    design: z.record(z.string(), z.unknown()),
    control_configuration: z.record(z.string(), z.unknown()),
    treatment_configuration: z.record(z.string(), z.unknown()),
    primary_metric: z.record(z.string(), z.unknown()),
    guardrail_metrics: z.array(z.record(z.string(), z.unknown())),
    duration_planning: z.record(z.string(), z.unknown()),
    implementation_notes: z.array(z.string()),
    confidence_level: z.enum(['medium', 'low']),
    confidence_basis: z.string().min(1),
    caveat_category: z.string().min(1),
    caveat_statement: z.string().min(1),
    generated_at: timestampSchema,
    experiment_engine_version: z.string().min(1),
    generation_provenance: z.record(z.string(), z.unknown()),
    experiment_hash: hashSchema,
  })
  .strict();

const persistedExperimentHypothesisRowSchema = z
  .object({
    experiment_id: uuidSchema,
    position: z.number().int().nonnegative(),
    hypothesis_id: uuidSchema,
  })
  .strict();

type PersistedExperimentRpcRow = z.infer<typeof persistedExperimentRpcRowSchema>;

function validateRpcRows(expectedHashes: string[], rows: unknown): PersistedExperimentRpcRow[] {
  const parsed = z.array(persistedExperimentRpcRowSchema).parse(rows);
  const expected = new Set(expectedHashes);
  if (
    expected.size !== expectedHashes.length ||
    parsed.length !== expectedHashes.length ||
    new Set(parsed.map(({ id }) => id)).size !== parsed.length ||
    new Set(parsed.map(({ experiment_hash }) => experiment_hash)).size !== parsed.length ||
    parsed.some(({ experiment_hash }) => !expected.has(experiment_hash))
  )
    throw new Error('Recommended experiment persistence returned an incomplete result.');
  return parsed;
}

export function hydrateExperimentRows(input: {
  experimentRows: unknown;
  hypothesisRows: unknown;
}): RecommendedExperiment[] {
  const experimentRows = z.array(persistedExperimentRowSchema).parse(input.experimentRows);
  const hypothesisRows = z
    .array(persistedExperimentHypothesisRowSchema)
    .parse(input.hypothesisRows);
  const experimentsById = new Map(experimentRows.map((row) => [row.id, row]));
  if (
    experimentsById.size !== experimentRows.length ||
    hypothesisRows.some((row) => !experimentsById.has(row.experiment_id))
  ) {
    throw new Error('Recommended experiment readback returned a mismatched result.');
  }

  const hypothesesByExperimentId = new Map<string, typeof hypothesisRows>();
  for (const reference of hypothesisRows) {
    const references = hypothesesByExperimentId.get(reference.experiment_id) ?? [];
    references.push(reference);
    hypothesesByExperimentId.set(reference.experiment_id, references);
  }
  for (const references of hypothesesByExperimentId.values()) {
    if (new Set(references.map(({ position }) => position)).size !== references.length) {
      throw new Error('Recommended experiment readback returned duplicate hypothesis positions.');
    }
    if (new Set(references.map(({ hypothesis_id }) => hypothesis_id)).size !== references.length) {
      throw new Error('Recommended experiment readback returned duplicate supporting hypotheses.');
    }
    references.sort((left, right) => left.position - right.position);
  }

  return experimentRows.map((experiment) =>
    recommendedExperimentSchema.parse({
      id: experiment.id,
      experimentType: experiment.experiment_type,
      ownedBrandId: experiment.owned_brand_id,
      competitorId: experiment.competitor_id,
      sourceHypothesisIds: (hypothesesByExperimentId.get(experiment.id) ?? []).map(
        ({ hypothesis_id }) => hypothesis_id,
      ),
      title: experiment.title,
      objective: experiment.objective,
      hypothesisUnderTest: experiment.hypothesis_under_test,
      design: experiment.design,
      control: experiment.control_configuration,
      treatment: experiment.treatment_configuration,
      primaryMetric: experiment.primary_metric,
      guardrailMetrics: experiment.guardrail_metrics,
      durationPlanning: experiment.duration_planning,
      implementationNotes: experiment.implementation_notes,
      confidence: { level: experiment.confidence_level, basis: experiment.confidence_basis },
      caveat: { category: experiment.caveat_category, statement: experiment.caveat_statement },
      generatedAt: experiment.generated_at,
      experimentEngineVersion: experiment.experiment_engine_version,
      generationProvenance: experiment.generation_provenance,
      experimentHash: experiment.experiment_hash,
    }),
  );
}

export function hydratePersistedExperiments(input: {
  expectedExperimentHashes: string[];
  rpcRows: unknown;
  experimentRows: unknown;
  hypothesisRows: unknown;
}): RecommendedExperiment[] {
  const rpcRows = validateRpcRows(input.expectedExperimentHashes, input.rpcRows);
  const experiments = hydrateExperimentRows({
    experimentRows: input.experimentRows,
    hypothesisRows: input.hypothesisRows,
  });
  const byId = new Map(experiments.map((experiment) => [experiment.id, experiment]));
  if (
    byId.size !== rpcRows.length ||
    rpcRows.some((row) => byId.get(row.id)?.experimentHash !== row.experiment_hash)
  ) {
    throw new Error('Recommended experiment readback returned a mismatched result.');
  }
  return rpcRows
    .map((row) => {
      const experiment = byId.get(row.id);
      if (!experiment)
        throw new Error('Recommended experiment readback returned a missing experiment.');
      return experiment;
    })
    .sort((left, right) => left.experimentHash.localeCompare(right.experimentHash));
}

async function persistExperiments(
  candidates: RecommendedExperimentCandidate[],
): Promise<RecommendedExperiment[]> {
  if (candidates.length === 0) return [];
  const validated = candidates.map((candidate) =>
    recommendedExperimentCandidateSchema.parse(candidate),
  );
  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_recommended_experiments', {
    p_experiments: validated,
  });
  if (error) throw new Error(error.message);

  const expectedExperimentHashes = validated.map(({ experimentHash }) => experimentHash);
  const rpcRows = validateRpcRows(expectedExperimentHashes, data ?? []);
  const experimentIds = rpcRows.map(({ id }) => id);
  const { data: experimentRows, error: experimentError } = await admin
    .from('recommended_experiments')
    .select(
      'id, owned_brand_id, competitor_id, experiment_type, title, objective, hypothesis_under_test, design, control_configuration, treatment_configuration, primary_metric, guardrail_metrics, duration_planning, implementation_notes, confidence_level, confidence_basis, caveat_category, caveat_statement, generated_at, experiment_engine_version, generation_provenance, experiment_hash',
    )
    .in('id', experimentIds)
    .order('id', { ascending: true });
  if (experimentError) throw new Error(experimentError.message);

  const { data: hypothesisRows, error: hypothesisError } = await admin
    .from('recommended_experiment_hypotheses')
    .select('experiment_id, position, hypothesis_id')
    .in('experiment_id', experimentIds)
    .order('experiment_id', { ascending: true })
    .order('position', { ascending: true });
  if (hypothesisError) throw new Error(hypothesisError.message);

  return hydratePersistedExperiments({
    expectedExperimentHashes,
    rpcRows,
    experimentRows: experimentRows ?? [],
    hypothesisRows: hypothesisRows ?? [],
  });
}

export type RecommendedExperimentsGenerateResult =
  | { status: 'ok'; experiments: RecommendedExperiment[] }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

async function loadCurrentExperimentInputs(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<
  | {
      status: 'ok';
      currentHypotheses: CurrentStrategicHypothesesProjection;
      supportingSignals: CompetitiveSignal[];
    }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' }
> {
  const current = await loadCurrentStrategicHypotheses(supabase, input);
  if (current.status !== 'ok') return current;
  const requiredSignalIds = new Set(
    current.projection.hypotheses.flatMap(({ supportingSignalIds }) => supportingSignalIds),
  );
  if (requiredSignalIds.size === 0) {
    return { status: 'ok', currentHypotheses: current.projection, supportingSignals: [] };
  }
  const historicalSignals = await loadHistoricalCompetitiveSignals(supabase, {
    brandId: input.brandId,
    competitorIds: input.competitorIds,
  });
  if (historicalSignals.status !== 'ok') return historicalSignals;
  const supportingSignals = historicalSignals.signals.filter(({ id }) => requiredSignalIds.has(id));
  if (supportingSignals.length !== requiredSignalIds.size) {
    throw new Error('Current strategic hypothesis lineage is incomplete.');
  }
  return { status: 'ok', currentHypotheses: current.projection, supportingSignals };
}

export async function generateRecommendedExperiments(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<RecommendedExperimentsGenerateResult> {
  const current = await loadCurrentExperimentInputs(supabase, input);
  if (current.status !== 'ok') return current;
  const candidates = generateRecommendedExperimentCandidates({
    currentHypotheses: current.currentHypotheses.hypotheses,
    supportingSignals: current.supportingSignals,
    generatedAt: input.generatedAt,
  });
  return { status: 'ok', experiments: await persistExperiments(candidates) };
}

export async function loadHistoricalRecommendedExperiments(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[] },
): Promise<RecommendedExperimentsGenerateResult> {
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id')
    .eq('id', input.brandId)
    .maybeSingle();
  if (brandError) throw new Error(brandError.message);
  if (!brand) return { status: 'brand_not_found' };

  const { data: competitors, error: competitorsError } = await supabase
    .from('competitors')
    .select('id')
    .eq('brand_id', input.brandId)
    .in('id', input.competitorIds);
  if (competitorsError) throw new Error(competitorsError.message);
  if (!competitors || competitors.length !== input.competitorIds.length) {
    return { status: 'competitors_not_found' };
  }
  const { data: experimentRows, error: experimentError } = await supabase
    .from('recommended_experiments')
    .select(
      'id, owned_brand_id, competitor_id, experiment_type, title, objective, hypothesis_under_test, design, control_configuration, treatment_configuration, primary_metric, guardrail_metrics, duration_planning, implementation_notes, confidence_level, confidence_basis, caveat_category, caveat_statement, generated_at, experiment_engine_version, generation_provenance, experiment_hash',
    )
    .eq('owned_brand_id', input.brandId)
    .in('competitor_id', input.competitorIds)
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false });
  if (experimentError) throw new Error(experimentError.message);
  const experimentIds = (experimentRows ?? []).map(({ id }) => id);
  if (experimentIds.length === 0) return { status: 'ok', experiments: [] };
  const { data: hypothesisRows, error: hypothesisError } = await supabase
    .from('recommended_experiment_hypotheses')
    .select('experiment_id, position, hypothesis_id')
    .in('experiment_id', experimentIds)
    .order('experiment_id', { ascending: true })
    .order('position', { ascending: true });
  if (hypothesisError) throw new Error(hypothesisError.message);
  return {
    status: 'ok',
    experiments: hydrateExperimentRows({
      experimentRows: experimentRows ?? [],
      hypothesisRows: hypothesisRows ?? [],
    }),
  };
}

export async function loadCurrentRecommendedExperiments(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<
  | { status: 'ok'; projection: CurrentRecommendedExperimentsProjection }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' }
> {
  const current = await loadCurrentExperimentInputs(supabase, input);
  if (current.status !== 'ok') return current;
  const history = await loadHistoricalRecommendedExperiments(supabase, input);
  if (history.status !== 'ok') return history;
  return {
    status: 'ok',
    projection: resolveCurrentRecommendedExperiments({
      currentHypotheses: current.currentHypotheses,
      supportingSignals: current.supportingSignals,
      historicalExperiments: history.experiments,
      generatedAt: input.generatedAt,
    }),
  };
}
