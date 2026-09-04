import 'server-only';

import {
  generateStrategicHypotheses as generateStrategicHypothesisCandidates,
  resolveCurrentStrategicHypotheses,
} from '@rivallens/intelligence';
import {
  currentStrategicHypothesesProjectionSchema,
  strategicHypothesisCandidateSchema,
  strategicHypothesisSchema,
  type CurrentStrategicHypothesesProjection,
  type StrategicHypothesis,
  type StrategicHypothesisCandidate,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  loadCurrentPersistedCompetitiveSignals,
  loadCurrentPersistedCompetitiveSignalsProjection,
} from './competitive-signals';

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });

const persistedHypothesisRpcRowSchema = z
  .object({ id: uuidSchema, hypothesis_hash: hashSchema, inserted: z.boolean() })
  .strict();

const persistedHypothesisRowSchema = z
  .object({
    id: uuidSchema,
    owned_brand_id: uuidSchema,
    competitor_id: uuidSchema,
    hypothesis_type: z.string().min(1),
    statement: z.string().min(1),
    rationale: z.string().min(1),
    confidence: z.enum(['medium', 'low']),
    uncertainty_category: z.string().min(1),
    uncertainty_statement: z.string().min(1),
    generated_at: timestampSchema,
    hypothesis_engine_version: z.string().min(1),
    generation_provenance: z.record(z.string(), z.unknown()),
    hypothesis_hash: hashSchema,
  })
  .strict();

const persistedHypothesisSignalRowSchema = z
  .object({
    hypothesis_id: uuidSchema,
    position: z.number().int().nonnegative(),
    signal_id: uuidSchema,
  })
  .strict();

type PersistedHypothesisRpcRow = z.infer<typeof persistedHypothesisRpcRowSchema>;

function validatePersistedHypothesisRpcRows(
  expectedHypothesisHashes: string[],
  rows: unknown,
): PersistedHypothesisRpcRow[] {
  const parsed = z.array(persistedHypothesisRpcRowSchema).parse(rows);
  const expected = new Set(expectedHypothesisHashes);
  if (
    expected.size !== expectedHypothesisHashes.length ||
    parsed.length !== expectedHypothesisHashes.length ||
    new Set(parsed.map((row) => row.id)).size !== parsed.length ||
    new Set(parsed.map((row) => row.hypothesis_hash)).size !== parsed.length ||
    parsed.some((row) => !expected.has(row.hypothesis_hash))
  ) {
    throw new Error('Strategic hypothesis persistence returned an incomplete result.');
  }
  return parsed;
}

export function hydrateHypothesisRows(input: {
  hypothesisRows: unknown;
  signalRows: unknown;
}): StrategicHypothesis[] {
  const hypothesisRows = z.array(persistedHypothesisRowSchema).parse(input.hypothesisRows);
  const signalRows = z.array(persistedHypothesisSignalRowSchema).parse(input.signalRows);
  const hypothesesById = new Map(hypothesisRows.map((row) => [row.id, row]));

  if (
    hypothesesById.size !== hypothesisRows.length ||
    signalRows.some((row) => !hypothesesById.has(row.hypothesis_id))
  ) {
    throw new Error('Strategic hypothesis readback returned a mismatched result.');
  }

  const signalsByHypothesisId = new Map<string, typeof signalRows>();
  for (const signal of signalRows) {
    const references = signalsByHypothesisId.get(signal.hypothesis_id) ?? [];
    references.push(signal);
    signalsByHypothesisId.set(signal.hypothesis_id, references);
  }
  for (const references of signalsByHypothesisId.values()) {
    if (new Set(references.map((reference) => reference.position)).size !== references.length) {
      throw new Error('Strategic hypothesis readback returned duplicate signal positions.');
    }
    if (new Set(references.map((reference) => reference.signal_id)).size !== references.length) {
      throw new Error('Strategic hypothesis readback returned duplicate supporting signals.');
    }
    references.sort((left, right) => left.position - right.position);
  }

  return hypothesisRows.map((hypothesis) =>
    strategicHypothesisSchema.parse({
      id: hypothesis.id,
      hypothesisType: hypothesis.hypothesis_type,
      ownedBrandId: hypothesis.owned_brand_id,
      competitorId: hypothesis.competitor_id,
      statement: hypothesis.statement,
      rationale: hypothesis.rationale,
      supportingSignalIds: (signalsByHypothesisId.get(hypothesis.id) ?? []).map(
        (reference) => reference.signal_id,
      ),
      confidence: hypothesis.confidence,
      uncertainty: {
        category: hypothesis.uncertainty_category,
        statement: hypothesis.uncertainty_statement,
      },
      generatedAt: hypothesis.generated_at,
      hypothesisEngineVersion: hypothesis.hypothesis_engine_version,
      generationProvenance: hypothesis.generation_provenance,
      hypothesisHash: hypothesis.hypothesis_hash,
    }),
  );
}

export function hydratePersistedHypotheses(input: {
  expectedHypothesisHashes: string[];
  rpcRows: unknown;
  hypothesisRows: unknown;
  signalRows: unknown;
}): StrategicHypothesis[] {
  const rpcRows = validatePersistedHypothesisRpcRows(
    input.expectedHypothesisHashes,
    input.rpcRows,
  );
  const hypotheses = hydrateHypothesisRows({
    hypothesisRows: input.hypothesisRows,
    signalRows: input.signalRows,
  });
  const hypothesesById = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));

  if (
    hypothesesById.size !== rpcRows.length ||
    rpcRows.some(
      (row) => hypothesesById.get(row.id)?.hypothesisHash !== row.hypothesis_hash,
    )
  ) {
    throw new Error('Strategic hypothesis readback returned a mismatched result.');
  }

  return rpcRows
    .map((rpcRow) => {
      const hypothesis = hypothesesById.get(rpcRow.id);
      if (!hypothesis) {
        throw new Error('Strategic hypothesis readback returned a missing hypothesis.');
      }
      return hypothesis;
    })
    .sort((left, right) => left.hypothesisHash.localeCompare(right.hypothesisHash));
}

async function persistHypotheses(
  candidates: StrategicHypothesisCandidate[],
): Promise<StrategicHypothesis[]> {
  if (candidates.length === 0) return [];

  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_strategic_hypotheses', {
    p_hypotheses: candidates,
  });
  if (error) throw new Error(error.message);

  const expectedHypothesisHashes = candidates.map((candidate) => candidate.hypothesisHash);
  const rpcRows = validatePersistedHypothesisRpcRows(expectedHypothesisHashes, data ?? []);
  const hypothesisIds = rpcRows.map((row) => row.id);
  const { data: hypothesisRows, error: hypothesisError } = await admin
    .from('strategic_hypotheses')
    .select(
      'id, owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence, uncertainty_category, uncertainty_statement, generated_at, hypothesis_engine_version, generation_provenance, hypothesis_hash',
    )
    .in('id', hypothesisIds)
    .order('id', { ascending: true });
  if (hypothesisError) throw new Error(hypothesisError.message);

  const { data: signalRows, error: signalError } = await admin
    .from('strategic_hypothesis_signals')
    .select('hypothesis_id, position, signal_id')
    .in('hypothesis_id', hypothesisIds)
    .order('hypothesis_id', { ascending: true })
    .order('position', { ascending: true });
  if (signalError) throw new Error(signalError.message);

  return hydratePersistedHypotheses({
    expectedHypothesisHashes,
    rpcRows,
    hypothesisRows: hypothesisRows ?? [],
    signalRows: signalRows ?? [],
  });
}

export type StrategicHypothesesGenerateResult =
  | { status: 'ok'; hypotheses: StrategicHypothesis[] }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export type StrategicHypothesesLoadResult =
  | { status: 'ok'; hypotheses: StrategicHypothesis[] }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export type CurrentStrategicHypothesesLoadResult =
  | { status: 'ok'; projection: CurrentStrategicHypothesesProjection }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

async function loadHistoricalStrategicHypothesesForAuthorizedBrand(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[] },
): Promise<StrategicHypothesesLoadResult> {
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

  const { data: hypothesisRows, error: hypothesisError } = await supabase
    .from('strategic_hypotheses')
    .select(
      'id, owned_brand_id, competitor_id, hypothesis_type, statement, rationale, confidence, uncertainty_category, uncertainty_statement, generated_at, hypothesis_engine_version, generation_provenance, hypothesis_hash',
    )
    .eq('owned_brand_id', input.brandId)
    .in('competitor_id', input.competitorIds)
    .order('generated_at', { ascending: false })
    .order('id', { ascending: false });
  if (hypothesisError) throw new Error(hypothesisError.message);
  const hypothesisIds = (hypothesisRows ?? []).map((hypothesis) => hypothesis.id);
  if (hypothesisIds.length === 0) return { status: 'ok', hypotheses: [] };

  const { data: signalRows, error: signalError } = await supabase
    .from('strategic_hypothesis_signals')
    .select('hypothesis_id, position, signal_id')
    .in('hypothesis_id', hypothesisIds)
    .order('hypothesis_id', { ascending: true })
    .order('position', { ascending: true });
  if (signalError) throw new Error(signalError.message);

  return {
    status: 'ok',
    hypotheses: hydrateHypothesisRows({
      hypothesisRows: hypothesisRows ?? [],
      signalRows: signalRows ?? [],
    }),
  };
}

export async function loadHistoricalStrategicHypotheses(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[] },
): Promise<StrategicHypothesesLoadResult> {
  return loadHistoricalStrategicHypothesesForAuthorizedBrand(supabase, input);
}

export async function loadCurrentStrategicHypotheses(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<CurrentStrategicHypothesesLoadResult> {
  const current = await loadCurrentPersistedCompetitiveSignalsProjection(supabase, input);
  if (current.status !== 'ok') return current;
  const historical = await loadHistoricalStrategicHypothesesForAuthorizedBrand(supabase, input);
  if (historical.status !== 'ok') return historical;

  return {
    status: 'ok',
    projection: currentStrategicHypothesesProjectionSchema.parse(
      resolveCurrentStrategicHypotheses({
        currentSignals: current.currentSignals,
        currentSignalUnresolved: current.projection.unresolved,
        historicalHypotheses: historical.hypotheses,
        historicalSignals: current.historicalSignals,
        generatedAt: input.generatedAt,
      }),
    ),
  };
}

export async function generateStrategicHypotheses(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<StrategicHypothesesGenerateResult> {
  const current = await loadCurrentPersistedCompetitiveSignals(supabase, input);
  if (current.status !== 'ok') return current;

  const candidates = generateStrategicHypothesisCandidates({
    currentSignals: current.signals,
    generatedAt: input.generatedAt,
  }).map((candidate) => strategicHypothesisCandidateSchema.parse(candidate));

  return { status: 'ok', hypotheses: await persistHypotheses(candidates) };
}
