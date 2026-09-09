import 'server-only';

import {
  strategicHypothesisTypeSchema,
  STRATEGIC_HYPOTHESIS_CANONICAL_COPY,
  type CompetitiveIntelligenceReport,
} from '@rivallens/schemas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { sourceRowSchema, snapshotRowSchema, observationRowSchema } from './provenance-evidence';
import {
  buildReportProvenance,
  type ReportProvenance,
  type StoredMeaning,
} from './provenance-view';
export { buildReportProvenance, unavailableReportProvenance } from './provenance-view';

export type ResolveProvenanceResult =
  { status: 'ok'; provenance: ReportProvenance } | { status: 'scope_not_found' };

/**
 * Read-only provenance resolver. It loads only the evidence references saved
 * with the report, then derives a drawer view for every item.
 * It writes nothing, and its return type cannot carry an identifier or a hash.
 */
export async function resolveReportProvenance(
  supabase: SupabaseClient,
  report: CompetitiveIntelligenceReport,
): Promise<ResolveProvenanceResult> {
  const items = Object.values(report.sections).flat();
  const refs = items.flatMap((item) =>
    item.provenance.signals.flatMap((signal) => signal.evidence),
  );
  const ids = (values: (string | null)[]) => [
    ...new Set(values.filter((id): id is string => id !== null)),
  ];
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('domain')
    .eq('id', report.brandId)
    .maybeSingle();
  if (brandError) throw new Error('Could not read report scope.');
  if (!brand) return { status: 'scope_not_found' };
  const ownedDomain = z.object({ domain: z.string().min(1) }).parse(brand).domain;
  const [sources, snapshots, observations] = await Promise.all([
    supabase
      .from('sources')
      .select('id, brand_id, competitor_id, source_type, canonical_url')
      .eq('brand_id', report.brandId)
      .in('id', ids(refs.map((r) => r.sourceId))),
    supabase
      .from('snapshots')
      .select('id, source_id, captured_at')
      .in('id', ids(refs.map((r) => r.snapshotId))),
    supabase
      .from('observations')
      .select(
        'id, snapshot_id, subject_id, fact_type, source_url, payload, observed_at, confidence',
      )
      .in('id', ids(refs.map((r) => r.observationId))),
  ]);
  if (sources.error || snapshots.error || observations.error)
    throw new Error('Could not read referenced evidence.');
  const shownHypothesisIds = new Set(
    report.sections.appearsToBeWorking.flatMap((item) =>
      item.provenance.hypotheses.map((h) => h.hypothesisId),
    ),
  );
  const missingHypothesisIds = ids(
    report.sections.whatToTestNext.flatMap((item) =>
      item.provenance.hypotheses.map((h) => h.hypothesisId),
    ),
  ).filter((id) => !shownHypothesisIds.has(id));
  const meanings = new Map<string, StoredMeaning>();
  if (missingHypothesisIds.length > 0) {
    const loaded = await supabase
      .from('strategic_hypotheses')
      .select('id, competitor_id, hypothesis_type, statement, uncertainty_statement')
      .eq('owned_brand_id', report.brandId)
      .in('id', missingHypothesisIds);
    if (loaded.error) throw new Error('Could not read referenced interpretation.');
    const rows = z
      .array(
        z.object({
          id: z.string().uuid(),
          competitor_id: z.string().uuid(),
          hypothesis_type: strategicHypothesisTypeSchema,
          statement: z.string(),
          uncertainty_statement: z.string(),
        }),
      )
      .parse(loaded.data ?? []);
    for (const row of rows) {
      const canonical = STRATEGIC_HYPOTHESIS_CANONICAL_COPY[row.hypothesis_type];
      if (
        row.statement !== canonical.statement ||
        row.uncertainty_statement !== canonical.uncertainty.statement
      )
        continue;
      meanings.set(row.id, {
        competitorId: row.competitor_id,
        statement: row.statement,
        uncertainty: row.uncertainty_statement,
      });
    }
  }
  return {
    status: 'ok',
    provenance: buildReportProvenance(
      report,
      {
        ownedDomain,
        sources: z.array(sourceRowSchema).parse(sources.data ?? []),
        snapshots: z.array(snapshotRowSchema).parse(snapshots.data ?? []),
        observations: z.array(observationRowSchema).parse(observations.data ?? []),
      },
      meanings,
    ),
  };
}
