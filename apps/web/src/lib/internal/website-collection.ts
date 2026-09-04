import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildWebsiteArtifactPath } from '@rivallens/domain';
import {
  websiteObservationCandidateSchema,
  websiteRawSnapshotSchema,
  type DiscoveredSource,
  type ObservationCandidate,
  type WebsiteRawSnapshot,
} from '@rivallens/schemas';
import { createInternalSupabaseAdminClient } from './supabase-admin';

const EVIDENCE_BUCKET = 'evidence';

export interface WebsiteRefreshTarget {
  organizationId: string;
  brandId: string;
  competitorId: string | null;
  subjectId: string;
}

export interface PersistedWebsiteSnapshot {
  sourceId: string;
  snapshotId: string;
  rawArtifactPath: string;
}

export async function persistWebsiteObservations(input: {
  snapshotId: string;
  subjectId: string;
  candidates: ObservationCandidate[];
}) {
  const candidates = input.candidates.map((candidate) => websiteObservationCandidateSchema.parse(candidate));
  if (candidates.length === 0) return 0;

  const supabase = createInternalSupabaseAdminClient();
  const { error } = await supabase.from('observations').upsert(
    candidates.map((candidate) => ({
      snapshot_id: input.snapshotId,
      subject_id: input.subjectId,
      fact_type: candidate.factType,
      source_url: candidate.sourceUrl,
      payload: candidate.payload,
      extraction_method: candidate.extractionMethod,
      confidence: candidate.confidence,
      extractor_version: candidate.extractorVersion,
      candidate_hash: observationCandidateHash(candidate),
      observed_at: candidate.observedAt,
    })),
    { onConflict: 'snapshot_id,candidate_hash', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return candidates.length;
}

export async function ensureWebsiteSource(target: WebsiteRefreshTarget, source: DiscoveredSource) {
  const supabase = createInternalSupabaseAdminClient();
  let query = supabase
    .from('sources')
    .select('id')
    .eq('brand_id', target.brandId)
    .eq('connector_type', 'website')
    .eq('canonical_url', source.canonicalUrl);

  query = target.competitorId ? query.eq('competitor_id', target.competitorId) : query.is('competitor_id', null);
  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('sources')
    .insert({
      brand_id: target.brandId,
      competitor_id: target.competitorId,
      connector_type: 'website',
      source_type: source.sourceType,
      canonical_url: source.canonicalUrl,
    })
    .select('id')
    .single();

  if (!createError && created) return created.id;
  if (createError?.code !== '23505') throw new Error(createError?.message ?? 'Unable to create website source.');

  const { data: concurrent, error: concurrentError } = await query.maybeSingle();
  if (concurrentError || !concurrent) throw new Error(concurrentError?.message ?? 'Unable to resolve website source.');
  return concurrent.id;
}

export async function ensureWebsiteSources(target: WebsiteRefreshTarget, sources: DiscoveredSource[]) {
  return Promise.all(sources.map((source) => ensureWebsiteSource(target, source)));
}

export async function persistWebsiteSnapshot(input: {
  target: WebsiteRefreshTarget;
  sourceId: string;
  snapshot: WebsiteRawSnapshot;
}): Promise<PersistedWebsiteSnapshot> {
  const snapshot = websiteRawSnapshotSchema.parse(input.snapshot);
  const supabase = createInternalSupabaseAdminClient();
  const snapshotId = randomUUID();
  const rawArtifactPath = buildWebsiteArtifactPath({ ...input.target, sourceId: input.sourceId, snapshotId });
  const rawBody = Buffer.from(snapshot.content.rawBodyBase64, 'base64');
  const actualRawHash = `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;
  if (actualRawHash !== snapshot.rawContentHash) {
    throw new Error('Website snapshot raw content hash did not match its payload.');
  }

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(rawArtifactPath, gzipSync(rawBody), { contentType: 'application/gzip', upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { error: snapshotError } = await supabase.from('snapshots').insert({
    id: snapshotId,
    source_id: input.sourceId,
    captured_at: snapshot.capturedAt,
    final_url: snapshot.metadata.finalUrl,
    http_status: snapshot.metadata.httpStatus,
    content_type: snapshot.metadata.contentType,
    raw_content_hash: snapshot.rawContentHash,
    content_hash: snapshot.contentHash,
    raw_artifact_path: rawArtifactPath,
    metadata: snapshot.metadata,
  });

  if (snapshotError) {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([rawArtifactPath]);
    throw new Error(snapshotError.message);
  }

  const { error: sourceError } = await supabase
    .from('sources')
    .update({ status: 'active', last_collected_at: snapshot.capturedAt, last_error: null })
    .eq('id', input.sourceId);
  if (sourceError) throw new Error(sourceError.message);

  return { sourceId: input.sourceId, snapshotId, rawArtifactPath };
}

export async function markWebsiteSourceFailed(sourceId: string, error: unknown) {
  const supabase = createInternalSupabaseAdminClient();
  const message = error instanceof Error ? error.message : 'Website collection failed.';
  const { error: updateError } = await supabase
    .from('sources')
    .update({ status: 'failed', last_error: message.slice(0, 500) })
    .eq('id', sourceId);
  if (updateError) throw new Error(updateError.message);
}

function observationCandidateHash(candidate: ObservationCandidate) {
  const value = JSON.stringify({
    factType: candidate.factType,
    sourceUrl: candidate.sourceUrl,
    payload: sortValue(candidate.payload),
    extractionMethod: candidate.extractionMethod,
    confidence: candidate.confidence,
    extractorVersion: candidate.extractorVersion,
  });
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}
