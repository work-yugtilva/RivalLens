import { buildBrandComparison } from '@rivallens/domain';
import {
  brandComparisonResultSchema,
  observationSchema,
  snapshotSchema,
  websiteSourceSchema,
  type BrandComparisonResult,
  type CompetitiveIntelligenceReport,
} from '@rivallens/schemas';
import { z } from 'zod';

export const sourceRowSchema = z.object({
  id: websiteSourceSchema.shape.id,
  brand_id: websiteSourceSchema.shape.brandId,
  competitor_id: websiteSourceSchema.shape.competitorId,
  source_type: websiteSourceSchema.shape.sourceType,
  canonical_url: websiteSourceSchema.shape.canonicalUrl,
});
export const snapshotRowSchema = z.object({
  id: snapshotSchema.shape.id,
  source_id: snapshotSchema.shape.sourceId,
  captured_at: snapshotSchema.shape.capturedAt,
});
export const observationRowSchema = z.object({
  id: observationSchema.shape.id,
  snapshot_id: observationSchema.shape.snapshotId,
  subject_id: observationSchema.shape.subjectId,
  fact_type: observationSchema.shape.factType,
  observed_at: observationSchema.shape.observedAt,
  payload: observationSchema.shape.payload,
  confidence: observationSchema.shape.confidence,
  source_url: z.string().url(),
});

export type ReferencedEvidence = {
  ownedDomain: string;
  sources: z.infer<typeof sourceRowSchema>[];
  snapshots: z.infer<typeof snapshotRowSchema>[];
  observations: z.infer<typeof observationRowSchema>[];
};
export type ProvenanceItem =
  CompetitiveIntelligenceReport['sections'][keyof CompetitiveIntelligenceReport['sections']][number];

/** Resolve only the immutable references belonging to this item, never current state. */
export function comparisonForItem(
  report: CompetitiveIntelligenceReport,
  item: ProvenanceItem,
  records: ReferencedEvidence,
): BrandComparisonResult {
  const sources = new Map(records.sources.map((row) => [row.id, row]));
  const snapshots = new Map(records.snapshots.map((row) => [row.id, row]));
  const observations = new Map(records.observations.map((row) => [row.id, row]));
  const base = {
    brandId: report.brandId,
    generatedAt: report.generatedAt,
    ownedSubject: {
      subjectType: 'brand' as const,
      subjectId: report.brandId,
      domain: records.ownedDomain,
    },
    competitors: [
      {
        subjectType: 'competitor' as const,
        subjectId: item.competitorId,
        domain: item.competitorName,
      },
    ],
  };
  const facts = item.provenance.signals.map((signal) => {
    const values: BrandComparisonResult['facts'][number]['valuesBySubjectId'] = {};
    for (const ref of signal.evidence) {
      if (ref.role !== 'owned' && ref.role !== 'competitor') continue;
      const subjectId = ref.role === 'owned' ? report.brandId : item.competitorId;
      const source = sources.get(ref.sourceId);
      const snapshot = snapshots.get(ref.snapshotId);
      if (
        !source ||
        source.brand_id !== report.brandId ||
        (source.competitor_id ?? report.brandId) !== subjectId ||
        !snapshot ||
        snapshot.source_id !== source.id
      )
        continue;

      if (ref.observationId === null) {
        // Snapshot-backed explicit absence is recorded by the saved signal.
        values[subjectId] = {
          state: 'explicitly_absent',
          value: null,
          provenance: {
            sourceId: source.id,
            snapshotId: snapshot.id,
            observationId: null,
            sourceUrl: source.canonical_url,
            observedAt: snapshot.captured_at,
            confidence: ref.confidence,
          },
        };
        continue;
      }
      const observation = observations.get(ref.observationId);
      if (
        !observation ||
        observation.snapshot_id !== snapshot.id ||
        observation.subject_id !== subjectId
      )
        continue;
      const result = buildBrandComparison({
        ...base,
        subjectsEvidence: [
          {
            subjectId,
            sources: [
              {
                sourceId: source.id,
                sourceType: source.source_type,
                snapshots: [
                  {
                    id: snapshot.id,
                    capturedAt: snapshot.captured_at,
                    observations: [
                      {
                        id: observation.id,
                        snapshotId: snapshot.id,
                        factType: observation.fact_type,
                        sourceUrl: observation.source_url,
                        observedAt: observation.observed_at,
                        confidence: observation.confidence,
                        payload: observation.payload,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const value = result.facts.find((fact) => fact.key === signal.comparisonKey)
        ?.valuesBySubjectId[subjectId];
      if (value?.provenance?.observationId === ref.observationId) values[subjectId] = value;
    }
    const fact: BrandComparisonResult['facts'][number] = {
      key: signal.comparisonKey,
      valuesBySubjectId: values,
    };
    const owned = values[report.brandId]?.value;
    const competitor = values[item.competitorId]?.value;
    const field =
      signal.comparisonKey === 'offer.free_shipping_threshold'
        ? 'threshold'
        : signal.comparisonKey.startsWith('policy.')
          ? 'durationDays'
          : signal.comparisonKey === 'subscription.discount'
            ? 'discountPercent'
            : null;
    const a = field ? owned?.[field] : undefined;
    const b = field ? competitor?.[field] : undefined;
    if (typeof a === 'number' && typeof b === 'number') {
      fact.numericDeltas = [
        {
          competitorSubjectId: item.competitorId,
          ownedValue: a,
          competitorValue: b,
          difference: b - a,
          unit: field === 'threshold' ? 'usd' : field === 'durationDays' ? 'days' : 'percent',
        },
      ];
    }
    return fact;
  });
  return brandComparisonResultSchema.parse({ ...base, facts, productsBySubject: {} });
}
