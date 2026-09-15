import 'server-only';

import { isDeepStrictEqual } from 'node:util';
import type { SubjectSourceEvidence } from '@rivallens/domain';
import {
  composeCompetitiveIntelligenceReport,
  resolveCurrentCompetitiveSignals,
  resolveCurrentRecommendedExperiments,
  resolveCurrentStrategicHypotheses,
} from '@rivallens/intelligence';
import {
  competitiveIntelligenceReportCandidateSchema,
  competitiveIntelligenceReportSchema,
  competitiveReportAnySchema,
  competitiveReportV2LlmCandidateSchema,
  competitiveReportV2LlmSchema,
  currentCompetitiveSignalsProjectionSchema,
  currentRecommendedExperimentsProjectionSchema,
  currentStrategicHypothesesProjectionSchema,
  type CompetitiveIntelligenceReport,
  type CompetitiveIntelligenceReportCandidate,
  type CompetitiveReportAny,
  type CompetitiveReportV2LlmCandidate,
  type BrandComparisonResult,
  type CompetitiveSignal,
  type CurrentCompetitiveSignalsProjection,
  type CurrentRecommendedExperimentsProjection,
  type CurrentStrategicHypothesesProjection,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { loadBrandComparison } from './brand-comparison';
import {
  intersectCurrentPersistedSignals,
  loadHistoricalCompetitiveSignals,
} from './competitive-signals';
import { loadHistoricalRecommendedExperiments } from './recommended-experiments';
import { loadHistoricalStrategicHypotheses } from './strategic-hypotheses';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });

const persistedReportRpcRowSchema = z
  .object({ id: uuidSchema, payload: competitiveIntelligenceReportCandidateSchema })
  .strict();
const persistedReportRpcRowsSchema = z.array(persistedReportRpcRowSchema).length(1);

const persistedLlmReportRpcRowSchema = z
  .object({
    id: uuidSchema,
    generation_run_id: uuidSchema,
    payload: competitiveReportV2LlmCandidateSchema,
  })
  .strict();
const persistedLlmReportRpcRowsSchema = z.array(persistedLlmReportRpcRowSchema).length(1);

const persistedReportRowSchema = z
  .object({
    id: uuidSchema,
    owned_brand_id: uuidSchema,
    competitor_ids: z.array(uuidSchema).min(1).max(5),
    report_engine_version: z.string().min(1),
    report_hash: hashSchema,
    generated_at: timestampSchema,
    generation_run_id: uuidSchema.nullable().optional().default(null),
    payload: z.unknown(),
  })
  .strict();

type ReportScopeStatus = 'brand_not_found' | 'competitors_not_found';

export type CompetitiveIntelligenceReportGenerateResult =
  | { status: 'ok'; report: CompetitiveIntelligenceReport }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export type ProductionCompetitiveReportGenerateResult =
  | { status: 'ok'; report: CompetitiveReportAny }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export type CompetitiveIntelligenceReportLoadResult =
  | { status: 'ok'; report: CompetitiveReportAny }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' }
  | { status: 'report_not_found' };

export type AuthorizedCompetitiveReportSourceState = {
  comparison: BrandComparisonResult;
  subjectsEvidence: SubjectSourceEvidence[];
  signalProjection: CurrentCompetitiveSignalsProjection;
  currentSignals: CompetitiveSignal[];
  hypothesisProjection: CurrentStrategicHypothesesProjection;
  experimentProjection: CurrentRecommendedExperimentsProjection;
  deterministicCandidate: CompetitiveIntelligenceReportCandidate;
};

function competitorIdsFromReport(
  report: CompetitiveIntelligenceReportCandidate | CompetitiveReportV2LlmCandidate,
): string[] {
  return report.competitors.map(({ id }) => id);
}

function normalizeCompetitorIds(competitorIds: string[]): string[] {
  return z.array(uuidSchema).min(1).max(5).parse([...new Set(competitorIds)].sort());
}

function postgresUuidArray(competitorIds: string[]): string {
  return `{${competitorIds.join(',')}}`;
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function hydrateReportRow(row: unknown): CompetitiveReportAny {
  const parsed = persistedReportRowSchema.parse(row);
  const payload =
    parsed.report_engine_version === 'competitive-report-v1'
      ? competitiveIntelligenceReportCandidateSchema.parse(parsed.payload)
      : parsed.report_engine_version === 'competitive-report-v2-llm'
        ? competitiveReportV2LlmCandidateSchema.parse(parsed.payload)
        : (() => {
            throw new Error('Unsupported competitive intelligence report version.');
          })();
  const competitorIds = competitorIdsFromReport(payload);
  if (
    parsed.owned_brand_id !== payload.brandId ||
    !isDeepStrictEqual(parsed.competitor_ids, competitorIds) ||
    parsed.report_engine_version !== payload.reportEngineVersion ||
    parsed.report_hash !== payload.reportHash ||
    !sameInstant(parsed.generated_at, payload.generatedAt) ||
    (payload.reportEngineVersion === 'competitive-report-v1'
      ? parsed.generation_run_id !== null
      : parsed.generation_run_id === null)
  ) {
    throw new Error('Competitive intelligence report row does not match its stored payload.');
  }
  return competitiveReportAnySchema.parse({ ...payload, id: parsed.id });
}

function hydratePersistedReport(
  candidate: CompetitiveIntelligenceReportCandidate,
  row: unknown,
): CompetitiveIntelligenceReport {
  const [parsed] = persistedReportRpcRowsSchema.parse(row);
  if (
    parsed.payload.brandId !== candidate.brandId ||
    parsed.payload.reportEngineVersion !== candidate.reportEngineVersion ||
    parsed.payload.reportHash !== candidate.reportHash ||
    parsed.payload.sourceStateHash !== candidate.sourceStateHash ||
    !isDeepStrictEqual(competitorIdsFromReport(parsed.payload), competitorIdsFromReport(candidate)) ||
    !isDeepStrictEqual(
      { ...parsed.payload, generatedAt: candidate.generatedAt },
      candidate,
    )
  ) {
    throw new Error('Competitive intelligence report persistence returned a mismatched result.');
  }
  return competitiveIntelligenceReportSchema.parse({ ...parsed.payload, id: parsed.id });
}

async function authorizeReportScope(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds?: string[] },
): Promise<{ status: 'ok' } | { status: ReportScopeStatus }> {
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id')
    .eq('id', input.brandId)
    .maybeSingle();
  if (brandError) throw new Error(brandError.message);
  if (!brand) return { status: 'brand_not_found' };

  if (input.competitorIds) {
    const { data: competitors, error: competitorError } = await supabase
      .from('competitors')
      .select('id')
      .eq('brand_id', input.brandId)
      .in('id', input.competitorIds);
    if (competitorError) throw new Error(competitorError.message);
    if (!competitors || competitors.length !== input.competitorIds.length) {
      return { status: 'competitors_not_found' };
    }
  }
  return { status: 'ok' };
}

export async function loadAuthorizedCompetitiveReportSourceState(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<
  | { status: 'ok'; value: AuthorizedCompetitiveReportSourceState }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' }
> {
  const competitorIds = normalizeCompetitorIds(input.competitorIds);
  const scopedInput = { ...input, competitorIds };
  const loaded = await loadBrandComparison(supabase, scopedInput);
  if (loaded.status !== 'ok') return loaded;

  const signalHistory = await loadHistoricalCompetitiveSignals(supabase, {
    brandId: input.brandId,
    competitorIds,
  });
  if (signalHistory.status !== 'ok') return signalHistory;
  const signalProjection = currentCompetitiveSignalsProjectionSchema.parse(
    resolveCurrentCompetitiveSignals({
      comparison: loaded.value.comparison,
      historicalSignals: signalHistory.signals,
      generatedAt: input.generatedAt,
    }),
  );
  const currentSignals = intersectCurrentPersistedSignals({
    projection: signalProjection,
    historicalSignals: signalHistory.signals,
  });

  const hypothesisHistory = await loadHistoricalStrategicHypotheses(supabase, {
    brandId: input.brandId,
    competitorIds,
  });
  if (hypothesisHistory.status !== 'ok') return hypothesisHistory;
  const hypothesisProjection = currentStrategicHypothesesProjectionSchema.parse(
    resolveCurrentStrategicHypotheses({
      currentSignals,
      currentSignalUnresolved: signalProjection.unresolved,
      historicalHypotheses: hypothesisHistory.hypotheses,
      historicalSignals: signalHistory.signals,
      generatedAt: input.generatedAt,
    }),
  );

  const experimentHistory = await loadHistoricalRecommendedExperiments(supabase, {
    brandId: input.brandId,
    competitorIds,
  });
  if (experimentHistory.status !== 'ok') return experimentHistory;
  const experimentProjection = currentRecommendedExperimentsProjectionSchema.parse(
    resolveCurrentRecommendedExperiments({
      currentHypotheses: hypothesisProjection,
      supportingSignals: currentSignals,
      historicalExperiments: experimentHistory.experiments,
      generatedAt: input.generatedAt,
    }),
  );

  const deterministicCandidate = competitiveIntelligenceReportCandidateSchema.parse(
    composeCompetitiveIntelligenceReport({
      comparison: loaded.value.comparison,
      signalProjection,
      currentSignals,
      hypothesisProjection,
      experimentProjection,
      generatedAt: input.generatedAt,
    }),
  );
  return {
    status: 'ok',
    value: {
      comparison: loaded.value.comparison,
      subjectsEvidence: loaded.value.subjectsEvidence,
      signalProjection,
      currentSignals,
      hypothesisProjection,
      experimentProjection,
      deterministicCandidate,
    },
  };
}

export async function persistDeterministicCompetitiveReport(
  candidate: CompetitiveIntelligenceReportCandidate,
): Promise<CompetitiveIntelligenceReport> {
  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_competitive_intelligence_report', {
    p_report: candidate,
  });
  if (error) throw new Error(error.message);
  return hydratePersistedReport(candidate, data);
}

export async function persistLlmCompetitiveReport(
  candidate: CompetitiveReportV2LlmCandidate,
  generationRunId: string,
): Promise<CompetitiveReportAny> {
  const parsedCandidate = competitiveReportV2LlmCandidateSchema.parse(candidate);
  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_competitive_intelligence_report_v2_llm', {
    p_generation_run_id: uuidSchema.parse(generationRunId),
    p_report: parsedCandidate,
  });
  if (error) throw new Error(error.message);
  const [row] = persistedLlmReportRpcRowsSchema.parse(data);
  if (
    row.generation_run_id !== generationRunId ||
    row.payload.reportHash !== parsedCandidate.reportHash ||
    !isDeepStrictEqual({ ...row.payload, generatedAt: parsedCandidate.generatedAt }, parsedCandidate)
  ) {
    throw new Error('LLM report persistence returned a mismatched result.');
  }
  return competitiveReportV2LlmSchema.parse({ ...row.payload, id: row.id });
}

export async function generateDeterministicCompetitiveIntelligenceReport(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<CompetitiveIntelligenceReportGenerateResult> {
  const loaded = await loadAuthorizedCompetitiveReportSourceState(supabase, input);
  if (loaded.status !== 'ok') return loaded;
  return {
    status: 'ok',
    report: await persistDeterministicCompetitiveReport(loaded.value.deterministicCandidate),
  };
}

export async function generateCompetitiveIntelligenceReport(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<ProductionCompetitiveReportGenerateResult> {
  if (!process.env.RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER) {
    return generateDeterministicCompetitiveIntelligenceReport(supabase, input);
  }
  const runtime = await import('./llm-report-runtime');
  return runtime.generateCompetitiveIntelligenceReport(supabase, input);
}

export async function loadLatestCompetitiveIntelligenceReport(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[] },
): Promise<CompetitiveIntelligenceReportLoadResult> {
  const competitorIds = normalizeCompetitorIds(input.competitorIds);
  const authorized = await authorizeReportScope(supabase, { ...input, competitorIds });
  if (authorized.status !== 'ok') return authorized;

  const { data, error } = await supabase
    .from('competitive_intelligence_reports')
    .select(
      'id, owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, generation_run_id, payload',
    )
    .eq('owned_brand_id', input.brandId)
    .eq('competitor_ids', postgresUuidArray(competitorIds))
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 'report_not_found' };
  return { status: 'ok', report: hydrateReportRow(data) };
}

export async function loadCompetitiveIntelligenceReport(
  supabase: SupabaseClient,
  input: { brandId: string; reportId: string },
): Promise<CompetitiveIntelligenceReportLoadResult> {
  const authorizedBrand = await authorizeReportScope(supabase, { brandId: input.brandId });
  if (authorizedBrand.status !== 'ok') return authorizedBrand;

  const { data, error } = await supabase
    .from('competitive_intelligence_reports')
    .select(
      'id, owned_brand_id, competitor_ids, report_engine_version, report_hash, generated_at, generation_run_id, payload',
    )
    .eq('owned_brand_id', input.brandId)
    .eq('id', input.reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 'report_not_found' };

  const row = persistedReportRowSchema.parse(data);
  const authorizedCompetitors = await authorizeReportScope(supabase, {
    brandId: input.brandId,
    competitorIds: row.competitor_ids,
  });
  if (authorizedCompetitors.status !== 'ok') return { status: 'report_not_found' };
  return { status: 'ok', report: hydrateReportRow(row) };
}
