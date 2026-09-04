import 'server-only';

import { detectObservedChanges, type ComparableObservation } from '@rivallens/domain';
import { createInternalSupabaseAdminClient } from './supabase-admin';

type RunObservedChangeDetectionInput = {
  sourceId: string;
  sourceType: string;
  subjectId: string;
  snapshotId: string;
  capturedAt: string;
};

type ObservationRow = {
  id: string;
  fact_type: string;
  source_url: string;
  payload: Record<string, unknown>;
};

function mapObservation(row: ObservationRow): ComparableObservation {
  return {
    id: row.id,
    factType: row.fact_type,
    sourceUrl: row.source_url,
    payload: row.payload,
  };
}

async function loadObservations(snapshotId: string): Promise<ComparableObservation[]> {
  const supabase = createInternalSupabaseAdminClient();
  const { data, error } = await supabase
    .from('observations')
    .select('id, fact_type, source_url, payload')
    .eq('snapshot_id', snapshotId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapObservation);
}

export async function runObservedChangeDetection(input: RunObservedChangeDetectionInput): Promise<number> {
  const supabase = createInternalSupabaseAdminClient();

  const { data: priorSnapshot, error: priorError } = await supabase
    .from('snapshots')
    .select('id, captured_at')
    .eq('source_id', input.sourceId)
    .lt('captured_at', input.capturedAt)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorError) throw new Error(priorError.message);

  const [currentObservations, previousObservations] = await Promise.all([
    loadObservations(input.snapshotId),
    priorSnapshot ? loadObservations(priorSnapshot.id) : Promise.resolve([]),
  ]);

  const candidates = detectObservedChanges({
    subjectId: input.subjectId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    currentSnapshot: { id: input.snapshotId, capturedAt: input.capturedAt },
    previousSnapshot: priorSnapshot
      ? { id: priorSnapshot.id, capturedAt: priorSnapshot.captured_at }
      : null,
    currentObservations,
    previousObservations,
    detectedAt: new Date().toISOString(),
  });

  if (candidates.length === 0) return 0;

  const { error: upsertError } = await supabase.from('observed_changes').upsert(
    candidates.map((candidate) => ({
      subject_id: candidate.subjectId,
      source_id: candidate.sourceId,
      fact_type: candidate.factType,
      change_type: candidate.changeType,
      previous_snapshot_id: candidate.previousSnapshotId,
      current_snapshot_id: candidate.currentSnapshotId,
      previous_observation_id: candidate.previousObservationId,
      current_observation_id: candidate.currentObservationId,
      fact_identity: candidate.factIdentity,
      before_value: candidate.beforeValue,
      after_value: candidate.afterValue,
      detected_at: candidate.detectedAt,
      detector_version: candidate.detectorVersion,
      change_hash: candidate.changeHash,
    })),
    { onConflict: 'current_snapshot_id,change_hash', ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(upsertError.message);

  return candidates.length;
}
