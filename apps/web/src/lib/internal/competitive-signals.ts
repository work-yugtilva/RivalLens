import 'server-only';

import {
  canEmitRemoval,
  computeEvaluatedScopes,
  type SubjectSourceEvidence,
} from '@rivallens/domain';
import {
  detectCompetitiveSignals,
  type EvidenceEnrichedObservedChange,
} from '@rivallens/intelligence';
import {
  competitiveSignalSchema,
  observedChangeSchema,
  type BrandComparisonResult,
  type CompetitiveSignalCandidate,
  type CompetitiveSignal,
  type CompetitiveSignalEvidenceReference,
  type ObservedChange,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

type SelectedSource = {
  subjectId: string;
  sourceId: string;
  sourceType: string;
  snapshot: SubjectSourceEvidence['sources'][number]['snapshots'][number];
  snapshots: SubjectSourceEvidence['sources'][number]['snapshots'];
};

const uuidSchema = z.string().uuid();
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });

const persistedSignalRpcRowSchema = z
  .object({ id: uuidSchema, signal_hash: hashSchema, inserted: z.boolean() })
  .strict();
const persistedSignalRowSchema = z
  .object({
    id: uuidSchema,
    owned_brand_id: uuidSchema,
    competitor_id: uuidSchema.nullable(),
    signal_type: z.string().min(1),
    comparison_key: z.string().min(1),
    statement: z.string().min(1),
    supporting_values: z.record(z.string(), z.unknown()),
    confidence: z.enum(['high', 'medium', 'low']),
    direction: z
      .enum(['competitor_lower', 'competitor_higher', 'different', 'added', 'removed'])
      .nullable(),
    generated_at: timestampSchema,
    rule_version: z.string().min(1),
    signal_hash: hashSchema,
  })
  .strict();
const persistedSignalEvidenceRowSchema = z
  .object({
    signal_id: uuidSchema,
    position: z.number().int().nonnegative(),
    role: z.enum([
      'owned',
      'competitor',
      'previous',
      'current',
      'evaluation',
      'previous_evaluation',
    ]),
    source_id: uuidSchema,
    snapshot_id: uuidSchema,
    observation_id: uuidSchema.nullable(),
    prior_snapshot_id: uuidSchema.nullable(),
    prior_observation_id: uuidSchema.nullable(),
    observed_change_id: uuidSchema.nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

type PersistedSignalRpcRow = z.infer<typeof persistedSignalRpcRowSchema>;

function validatePersistedSignalRpcRows(
  expectedSignalHashes: string[],
  rows: unknown,
): PersistedSignalRpcRow[] {
  const parsed = z.array(persistedSignalRpcRowSchema).parse(rows);
  const expected = new Set(expectedSignalHashes);
  if (
    expected.size !== expectedSignalHashes.length ||
    parsed.length !== expectedSignalHashes.length ||
    new Set(parsed.map((row) => row.id)).size !== parsed.length ||
    new Set(parsed.map((row) => row.signal_hash)).size !== parsed.length ||
    parsed.some((row) => !expected.has(row.signal_hash))
  ) {
    throw new Error('Competitive signal persistence returned an incomplete result.');
  }
  return parsed;
}

export function hydratePersistedSignals(input: {
  expectedSignalHashes: string[];
  rpcRows: unknown;
  signalRows: unknown;
  evidenceRows: unknown;
}): CompetitiveSignal[] {
  const rpcRows = validatePersistedSignalRpcRows(input.expectedSignalHashes, input.rpcRows);
  const signalRows = z.array(persistedSignalRowSchema).parse(input.signalRows);
  const evidenceRows = z.array(persistedSignalEvidenceRowSchema).parse(input.evidenceRows);
  const rpcById = new Map(rpcRows.map((row) => [row.id, row]));
  const signalsById = new Map(signalRows.map((row) => [row.id, row]));

  if (
    signalsById.size !== signalRows.length ||
    signalsById.size !== rpcRows.length ||
    signalRows.some((row) => rpcById.get(row.id)?.signal_hash !== row.signal_hash) ||
    evidenceRows.some((row) => !rpcById.has(row.signal_id))
  ) {
    throw new Error('Competitive signal readback returned a mismatched result.');
  }

  const evidenceBySignalId = new Map<string, typeof evidenceRows>();
  for (const evidence of evidenceRows) {
    const references = evidenceBySignalId.get(evidence.signal_id) ?? [];
    references.push(evidence);
    evidenceBySignalId.set(evidence.signal_id, references);
  }
  for (const references of evidenceBySignalId.values()) {
    if (new Set(references.map((reference) => reference.position)).size !== references.length) {
      throw new Error('Competitive signal readback returned duplicate evidence positions.');
    }
    references.sort((left, right) => left.position - right.position);
  }

  return rpcRows
    .map((rpcRow) => {
      const signal = signalsById.get(rpcRow.id);
      if (!signal) throw new Error('Competitive signal readback returned a missing signal.');
      return competitiveSignalSchema.parse({
        id: signal.id,
        ownedBrandId: signal.owned_brand_id,
        competitorId: signal.competitor_id,
        signalType: signal.signal_type,
        comparisonKey: signal.comparison_key,
        statement: signal.statement,
        supportingValues: signal.supporting_values,
        confidence: signal.confidence,
        evidence: (evidenceBySignalId.get(signal.id) ?? []).map((evidence) => ({
          role: evidence.role,
          sourceId: evidence.source_id,
          snapshotId: evidence.snapshot_id,
          observationId: evidence.observation_id,
          ...(evidence.prior_snapshot_id ? { priorSnapshotId: evidence.prior_snapshot_id } : {}),
          ...(evidence.prior_observation_id
            ? { priorObservationId: evidence.prior_observation_id }
            : {}),
          ...(evidence.observed_change_id ? { observedChangeId: evidence.observed_change_id } : {}),
          confidence: evidence.confidence,
        })),
        generatedAt: signal.generated_at,
        ruleVersion: signal.rule_version,
        signalHash: signal.signal_hash,
        ...(signal.direction ? { direction: signal.direction } : {}),
      });
    })
    .sort((left, right) => left.signalHash.localeCompare(right.signalHash));
}

function latestEvaluatedSources(
  subjectsEvidence: SubjectSourceEvidence[],
  competitorIds: Set<string>,
): Map<string, SelectedSource> {
  const selected = new Map<string, SelectedSource>();
  for (const subject of subjectsEvidence) {
    if (!competitorIds.has(subject.subjectId)) continue;
    for (const source of subject.sources) {
      const snapshots = [...source.snapshots].sort(
        (left, right) =>
          left.capturedAt.localeCompare(right.capturedAt) || left.id.localeCompare(right.id),
      );
      let snapshot: (typeof snapshots)[number] | undefined;
      for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        if (snapshots[index]?.observations.length) {
          snapshot = snapshots[index];
          break;
        }
      }
      if (!snapshot) continue;
      selected.set(source.sourceId, {
        subjectId: subject.subjectId,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        snapshot,
        snapshots,
      });
    }
  }
  return selected;
}

function observationReference(
  role: 'previous' | 'current',
  change: ObservedChange,
  source: SelectedSource,
): CompetitiveSignalEvidenceReference | null {
  const observationId =
    role === 'previous' ? change.previousObservationId : change.currentObservationId;
  const snapshotId = role === 'previous' ? change.previousSnapshotId : change.currentSnapshotId;
  if (!observationId || !snapshotId) return null;

  const snapshot = source.snapshots.find((candidate) => candidate.id === snapshotId);
  const observation = snapshot?.observations.find((candidate) => candidate.id === observationId);
  if (!observation || observation.snapshotId !== snapshotId) return null;

  return {
    role,
    sourceId: change.sourceId,
    snapshotId,
    observationId,
    observedChangeId: change.id,
    confidence: observation.confidence,
  };
}

function removalComparisonKey(change: ObservedChange): string | null {
  if (change.changeType === 'subscription.removed') return 'subscription.available';
  if (
    change.changeType === 'offer.promo.removed' &&
    change.factIdentity.startsWith('offer:promo:')
  ) {
    return `offer.promo:${change.factIdentity.slice('offer:promo:'.length)}`;
  }
  if (
    change.changeType === 'offer.discount.removed' &&
    change.factIdentity.startsWith('offer:discount:')
  ) {
    return `offer.discount:${change.factIdentity.slice('offer:discount:'.length)}`;
  }
  return null;
}

function evaluationReference(
  comparison: BrandComparisonResult,
  change: ObservedChange,
  source: SelectedSource,
): CompetitiveSignalEvidenceReference | null {
  const key = removalComparisonKey(change);
  if (!key || !change.previousSnapshotId || !change.previousObservationId) return null;

  const fact = comparison.facts.filter((candidate) => candidate.key === key);
  const value = fact.length === 1 ? fact[0]?.valuesBySubjectId[change.subjectId] : undefined;
  const provenance = value?.state === 'explicitly_absent' ? value.provenance : null;
  if (
    !provenance ||
    provenance.observationId !== null ||
    provenance.sourceId !== change.sourceId ||
    provenance.snapshotId !== change.currentSnapshotId ||
    provenance.priorSnapshotId !== change.previousSnapshotId ||
    provenance.priorObservationId !== change.previousObservationId ||
    source.snapshot.id !== change.currentSnapshotId ||
    source.snapshot.observations.length === 0
  ) {
    return null;
  }

  const anchor = source.snapshot.observations[0];
  if (
    !anchor ||
    anchor.sourceUrl !== provenance.sourceUrl ||
    anchor.confidence !== provenance.confidence
  ) {
    return null;
  }

  return {
    role: 'evaluation',
    sourceId: change.sourceId,
    snapshotId: change.currentSnapshotId,
    observationId: null,
    observedChangeId: change.id,
    confidence: provenance.confidence,
  };
}

function previousEvaluationReference(
  change: ObservedChange,
  source: SelectedSource,
): CompetitiveSignalEvidenceReference | null {
  if (
    (change.changeType !== 'subscription.added' && change.changeType !== 'offer.promo.added') ||
    change.previousSnapshotId === null ||
    change.previousObservationId !== null
  ) {
    return null;
  }

  const snapshot = source.snapshots.find((candidate) => candidate.id === change.previousSnapshotId);
  if (!snapshot || snapshot.observations.length === 0) return null;

  const evaluatedScopes = computeEvaluatedScopes(source.sourceType, snapshot.observations);
  if (!canEmitRemoval(change.factIdentity, change.factType, evaluatedScopes)) return null;

  const anchor = [...snapshot.observations].sort(
    (left, right) =>
      left.observedAt.localeCompare(right.observedAt) || left.id.localeCompare(right.id),
  )[0];
  if (!anchor || anchor.snapshotId !== snapshot.id) return null;

  return {
    role: 'previous_evaluation',
    sourceId: change.sourceId,
    snapshotId: snapshot.id,
    observationId: anchor.id,
    observedChangeId: change.id,
    confidence: anchor.confidence,
  };
}

/** Builds only evidence that is coherent with the comparison's selected current state. */
export function enrichObservedChanges(input: {
  comparison: BrandComparisonResult;
  subjectsEvidence: SubjectSourceEvidence[];
  observedChanges: ObservedChange[];
}): EvidenceEnrichedObservedChange[] {
  const competitorIds = new Set(
    input.comparison.competitors.map((competitor) => competitor.subjectId),
  );
  const selectedSources = latestEvaluatedSources(input.subjectsEvidence, competitorIds);

  return input.observedChanges.flatMap((change) => {
    const source = selectedSources.get(change.sourceId);
    if (
      !source ||
      source.subjectId !== change.subjectId ||
      source.snapshot.id !== change.currentSnapshotId
    ) {
      return [];
    }

    const evidence: CompetitiveSignalEvidenceReference[] = [];
    if (change.previousObservationId !== null) {
      const previous = observationReference('previous', change, source);
      if (!previous) return [];
      evidence.push(previous);
    }
    const isEvaluatedAddition =
      change.changeType === 'subscription.added' || change.changeType === 'offer.promo.added';
    const priorEvaluation = previousEvaluationReference(change, source);
    if (isEvaluatedAddition && (!priorEvaluation || change.currentObservationId === null)) {
      return [];
    }
    if (priorEvaluation) evidence.push(priorEvaluation);

    if (change.currentObservationId !== null) {
      const current = observationReference('current', change, source);
      if (!current) return [];
      evidence.push(current);
    }
    if (removalComparisonKey(change)) {
      const evaluation = evaluationReference(input.comparison, change, source);
      if (!evaluation || !evidence.some((reference) => reference.role === 'previous')) return [];
      evidence.push(evaluation);
    }

    return [{ change, evidence }];
  });
}

async function loadRecentObservedChanges(
  supabase: SupabaseClient,
  input: {
    subjectsEvidence: SubjectSourceEvidence[];
    competitorIds: string[];
  },
): Promise<ObservedChange[]> {
  const selectedSources = latestEvaluatedSources(
    input.subjectsEvidence,
    new Set(input.competitorIds),
  );
  const sourceIds = [...selectedSources.keys()];
  const snapshotIds = [...selectedSources.values()].map((source) => source.snapshot.id);
  if (sourceIds.length === 0 || snapshotIds.length === 0) return [];

  const { data, error } = await supabase
    .from('observed_changes')
    .select(
      'id, subject_id, source_id, fact_type, change_type, previous_snapshot_id, current_snapshot_id, previous_observation_id, current_observation_id, fact_identity, before_value, after_value, detected_at, detector_version, change_hash',
    )
    .in('source_id', sourceIds)
    .in('current_snapshot_id', snapshotIds)
    .order('detected_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) =>
    observedChangeSchema.parse({
      id: row.id,
      subjectId: row.subject_id,
      sourceId: row.source_id,
      factType: row.fact_type,
      changeType: row.change_type,
      previousSnapshotId: row.previous_snapshot_id,
      currentSnapshotId: row.current_snapshot_id,
      previousObservationId: row.previous_observation_id,
      currentObservationId: row.current_observation_id,
      factIdentity: row.fact_identity,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      detectedAt: row.detected_at,
      detectorVersion: row.detector_version,
      changeHash: row.change_hash,
    }),
  );
}

async function persistSignals(
  candidates: CompetitiveSignalCandidate[],
): Promise<CompetitiveSignal[]> {
  if (candidates.length === 0) return [];

  const { createInternalSupabaseAdminClient } = await import('./supabase-admin');
  const admin = createInternalSupabaseAdminClient();
  const { data, error } = await admin.rpc('persist_competitive_signals', { p_signals: candidates });
  if (error) throw new Error(error.message);

  const expectedSignalHashes = candidates.map((candidate) => candidate.signalHash);
  const rpcRows = validatePersistedSignalRpcRows(expectedSignalHashes, data ?? []);
  const signalIds = rpcRows.map((row) => row.id);
  const { data: signalRows, error: signalError } = await admin
    .from('competitive_signals')
    .select(
      'id, owned_brand_id, competitor_id, signal_type, comparison_key, statement, supporting_values, confidence, direction, generated_at, rule_version, signal_hash',
    )
    .in('id', signalIds)
    .order('id', { ascending: true });
  if (signalError) throw new Error(signalError.message);

  const { data: evidenceRows, error: evidenceError } = await admin
    .from('competitive_signal_evidence')
    .select(
      'signal_id, position, role, source_id, snapshot_id, observation_id, prior_snapshot_id, prior_observation_id, observed_change_id, confidence',
    )
    .in('signal_id', signalIds)
    .order('signal_id', { ascending: true })
    .order('position', { ascending: true });
  if (evidenceError) throw new Error(evidenceError.message);

  return hydratePersistedSignals({
    expectedSignalHashes,
    rpcRows,
    signalRows: signalRows ?? [],
    evidenceRows: evidenceRows ?? [],
  });
}

export type CompetitiveSignalsLoadResult =
  | { status: 'ok'; signals: CompetitiveSignal[] }
  | { status: 'brand_not_found' }
  | { status: 'competitors_not_found' };

export async function generateCompetitiveSignals(
  supabase: SupabaseClient,
  input: { brandId: string; competitorIds: string[]; generatedAt: string },
): Promise<CompetitiveSignalsLoadResult> {
  const { loadBrandComparison } = await import('./brand-comparison');
  const loaded = await loadBrandComparison(supabase, input);
  if (loaded.status !== 'ok') return loaded;

  const observedChanges = await loadRecentObservedChanges(supabase, {
    subjectsEvidence: loaded.value.subjectsEvidence,
    competitorIds: input.competitorIds,
  });
  const candidates = detectCompetitiveSignals({
    comparison: loaded.value.comparison,
    observedChanges: enrichObservedChanges({
      comparison: loaded.value.comparison,
      subjectsEvidence: loaded.value.subjectsEvidence,
      observedChanges,
    }),
    generatedAt: input.generatedAt,
  });

  return { status: 'ok', signals: await persistSignals(candidates) };
}
