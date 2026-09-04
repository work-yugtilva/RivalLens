import 'server-only';

import {
  buildBrandComparison,
  type EvidenceObservation,
  type SourceEvidence,
  type SubjectSourceEvidence,
} from '@rivallens/domain';
import { brandComparisonResultSchema, type BrandComparisonResult } from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';

type SourceRow = {
  id: string;
  source_type: string;
  competitor_id: string | null;
};

type SnapshotRow = {
  id: string;
  source_id: string;
  captured_at: string;
};

type ObservationRow = {
  id: string;
  snapshot_id: string;
  subject_id: string;
  fact_type: string;
  source_url: string;
  payload: Record<string, unknown>;
  observed_at: string;
  confidence: number;
};

function mapObservation(row: ObservationRow): EvidenceObservation {
  return {
    id: row.id,
    factType: row.fact_type,
    sourceUrl: row.source_url,
    payload: row.payload,
    observedAt: row.observed_at,
    confidence: row.confidence,
    snapshotId: row.snapshot_id,
  };
}

export function assertObservationSubject(input: {
  observedSubjectId: string;
  sourceId: string;
  expectedSubjectId: string | undefined;
}) {
  if (!input.expectedSubjectId || input.observedSubjectId !== input.expectedSubjectId) {
    throw new Error('Observation subject does not match the source subject.');
  }
}

function sourcesForSubject(
  sources: SourceRow[],
  ownedSubjectId: string,
  subjectId: string,
): SourceRow[] {
  if (subjectId === ownedSubjectId) {
    return sources.filter((source) => source.competitor_id === null);
  }
  return sources.filter((source) => source.competitor_id === subjectId);
}

export async function loadBrandComparisonEvidence(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    ownedSubjectId: string;
    competitorIds: string[];
  },
): Promise<SubjectSourceEvidence[]> {
  const subjectIds = [input.ownedSubjectId, ...input.competitorIds];

  const { data: sourceRows, error: sourceError } = await supabase
    .from('sources')
    .select('id, source_type, competitor_id')
    .eq('brand_id', input.brandId)
    .eq('connector_type', 'website')
    .order('id', { ascending: true });
  if (sourceError) throw new Error(sourceError.message);

  const selectedCompetitors = new Set(input.competitorIds);
  const sources = (sourceRows ?? []).filter(
    (source) => source.competitor_id === null || selectedCompetitors.has(source.competitor_id),
  );
  const sourceIds = sources.map((source) => source.id);
  if (sourceIds.length === 0) {
    return subjectIds.map((subjectId) => ({ subjectId, sources: [] }));
  }

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('snapshots')
    .select('id, source_id, captured_at')
    .in('source_id', sourceIds)
    .order('captured_at', { ascending: true })
    .order('id', { ascending: true });
  if (snapshotError) throw new Error(snapshotError.message);

  const snapshots = snapshotRows ?? [];
  const snapshotIds = snapshots.map((snapshot) => snapshot.id);
  const subjectIdBySourceId = new Map(
    sources.map((source) => [source.id, source.competitor_id ?? input.ownedSubjectId]),
  );
  const sourceIdBySnapshotId = new Map(
    snapshots.map((snapshot) => [snapshot.id, snapshot.source_id]),
  );
  const observationsBySnapshot = new Map<string, EvidenceObservation[]>();

  if (snapshotIds.length > 0) {
    const { data: observationRows, error: observationError } = await supabase
      .from('observations')
      .select(
        'id, snapshot_id, subject_id, fact_type, source_url, payload, observed_at, confidence',
      )
      .in('snapshot_id', snapshotIds)
      .order('observed_at', { ascending: true })
      .order('id', { ascending: true });
    if (observationError) throw new Error(observationError.message);

    for (const row of observationRows ?? []) {
      const observation = row as ObservationRow;
      const sourceId = sourceIdBySnapshotId.get(observation.snapshot_id);
      const expectedSubjectId = sourceId ? subjectIdBySourceId.get(sourceId) : undefined;
      assertObservationSubject({
        observedSubjectId: observation.subject_id,
        sourceId: sourceId ?? '',
        expectedSubjectId,
      });
      const mapped = mapObservation(observation);
      const bucket = observationsBySnapshot.get(mapped.snapshotId) ?? [];
      bucket.push(mapped);
      observationsBySnapshot.set(mapped.snapshotId, bucket);
    }
  }

  const snapshotsBySource = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    const bucket = snapshotsBySource.get(snapshot.source_id) ?? [];
    bucket.push(snapshot as SnapshotRow);
    snapshotsBySource.set(snapshot.source_id, bucket);
  }

  return subjectIds.map((subjectId) => {
    const subjectSources = sourcesForSubject(sources, input.ownedSubjectId, subjectId);
    const evidence: SourceEvidence[] = subjectSources.map((source) => ({
      sourceId: source.id,
      sourceType: source.source_type,
      snapshots: (snapshotsBySource.get(source.id) ?? []).map((snapshot) => ({
        id: snapshot.id,
        capturedAt: snapshot.captured_at,
        observations: observationsBySnapshot.get(snapshot.id) ?? [],
      })),
    }));

    return { subjectId, sources: evidence };
  });
}

export type LoadedBrandComparison = {
  comparison: BrandComparisonResult;
  subjectsEvidence: SubjectSourceEvidence[];
};

export type BrandComparisonLoadResult =
  | { status: 'ok'; value: LoadedBrandComparison }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export async function loadBrandComparison(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    competitorIds: string[];
    generatedAt: string;
  },
): Promise<BrandComparisonLoadResult> {
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, domain')
    .eq('id', input.brandId)
    .maybeSingle();
  if (brandError) throw new Error(brandError.message);
  if (!brand) return { status: 'brand_not_found' };

  const { data: competitorRows, error: competitorsError } = await supabase
    .from('competitors')
    .select('id, domain')
    .eq('brand_id', input.brandId)
    .in('id', input.competitorIds);
  if (competitorsError) throw new Error(competitorsError.message);
  if (!competitorRows || competitorRows.length !== input.competitorIds.length) {
    return { status: 'competitors_not_found' };
  }

  const competitorsById = new Map(competitorRows.map((competitor) => [competitor.id, competitor]));
  const competitors = input.competitorIds.map((competitorId) => competitorsById.get(competitorId));
  if (competitors.some((competitor) => !competitor)) {
    return { status: 'competitors_not_found' };
  }

  const subjectsEvidence = await loadBrandComparisonEvidence(supabase, {
    brandId: input.brandId,
    ownedSubjectId: brand.id,
    competitorIds: input.competitorIds,
  });
  const comparison = brandComparisonResultSchema.parse(
    buildBrandComparison({
      brandId: input.brandId,
      generatedAt: input.generatedAt,
      ownedSubject: { subjectType: 'brand', subjectId: brand.id, domain: brand.domain },
      competitors: competitors.map((competitor) => ({
        subjectType: 'competitor' as const,
        subjectId: competitor!.id,
        domain: competitor!.domain,
      })),
      subjectsEvidence,
    }),
  );

  return { status: 'ok', value: { comparison, subjectsEvidence } };
}
