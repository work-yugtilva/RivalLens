/**
 * Fixtures for the dev-only Overview preview. They exist so every approved
 * state can be compared against docs/design/final/ without a database, and
 * they are never imported by a production route.
 *
 * Each report variant is parsed with the real report schema, so a state that
 * could not exist in the product cannot be previewed either.
 */
import completeReportJson from '../../../../../docs/examples/competitive-report.json';
import {
  competitiveIntelligenceReportSchema,
  type CompetitiveIntelligenceReport,
} from '@rivallens/schemas';
import type { EvidenceDrawerView } from './provenance-types';
import { buildReportProvenance } from './provenance-view';
import type { ReferencedEvidence } from './provenance-evidence';

export const PREVIEW_STATES = [
  'complete',
  'partial',
  'insufficient',
  'generation-required',
  'unresolved',
  'empty-section',
  'no-report',
  'loading',
  'error',
] as const;

export type PreviewState = (typeof PREVIEW_STATES)[number];

export function isPreviewState(value: string): value is PreviewState {
  return (PREVIEW_STATES as readonly string[]).includes(value);
}

const OWNED_BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const REPORT_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_HASH = `sha256:${'a'.repeat(64)}`;

type RawReport = typeof completeReportJson;

function parse(report: unknown): CompetitiveIntelligenceReport {
  return competitiveIntelligenceReportSchema.parse(report);
}

function clone(): RawReport {
  return structuredClone(completeReportJson) as RawReport;
}

function base(): Record<string, unknown> {
  return { ...clone(), id: REPORT_ID };
}

const unknownComparison = (comparisonKey: string) => ({
  competitorId: COMPETITOR_ID,
  comparisonKey,
  subjectIds: [OWNED_BRAND_ID, COMPETITOR_ID].sort(),
});

const unresolvedSignal = (
  comparisonKey: string,
  signalFamily: 'relative_numeric' | 'presence_difference' | 'positioning_difference',
) => ({
  logicalIdentity: {
    ownedBrandId: OWNED_BRAND_ID,
    competitorId: COMPETITOR_ID,
    comparisonKey,
    signalFamily,
  },
  state: 'unknown',
});

const generationNeededSignal = (
  comparisonKey: string,
  signalFamily: 'relative_numeric' | 'presence_difference' | 'positioning_difference',
) => ({
  logicalIdentity: {
    ownedBrandId: OWNED_BRAND_ID,
    competitorId: COMPETITOR_ID,
    comparisonKey,
    signalFamily,
  },
  candidateSignalHash: CANDIDATE_HASH,
  ruleVersion: 'competitive-signals-v1',
});

const generationNeededExperiment = () => ({
  logicalIdentity: {
    ownedBrandId: OWNED_BRAND_ID,
    competitorId: COMPETITOR_ID,
    hypothesisType: 'competitor_may_emphasize_repeat_purchase_mechanics',
    experimentType: 'subscription_availability',
  },
  sourceHypothesisIds: ['00000000-0000-4000-8000-000000000101'],
  candidateExperimentHash: CANDIDATE_HASH,
  experimentEngineVersion: 'recommended-experiments-v1',
});

/** Complete: every section supported, no gaps. */
function completeReport(): CompetitiveIntelligenceReport {
  return parse(base());
}

/**
 * Partial: one comparison unknown, one signal unresolved, one test not yet
 * generated. The section that loses its only item keeps its place and explains
 * the absence rather than disappearing.
 */
function partialReport(): CompetitiveIntelligenceReport {
  const report = base() as RawReport & { id: string };
  report.sections.yourAdvantages = [];
  report.sections.whatToTestNext = report.sections.whatToTestNext.slice(0, 1);
  report.completeness = {
    ...report.completeness,
    state: 'partial',
    comparisonUnknown: [unknownComparison('policy.guarantee_duration')],
    signals: {
      unresolved: [unresolvedSignal('policy.return_window', 'relative_numeric')],
      generationNeeded: [],
    },
    experiments: { unresolved: [], generationNeeded: [generationNeededExperiment()] },
    sections: {
      yourAdvantages: { state: 'unresolved', available: 1, omitted: 1 },
      competitorAdvantages: { state: 'supported', available: 2, omitted: 0 },
      appearsToBeWorking: { state: 'supported', available: 2, omitted: 0 },
      whatToTestNext: { state: 'supported', available: 1, omitted: 0 },
    },
  } as RawReport['completeness'];
  return parse(report);
}

/** Insufficient: nothing resolved. The four sections stay and state their reasons. */
function insufficientReport(): CompetitiveIntelligenceReport {
  const report = base() as RawReport & { id: string };
  report.sections = {
    yourAdvantages: [],
    competitorAdvantages: [],
    appearsToBeWorking: [],
    whatToTestNext: [],
  };
  report.completeness = {
    ...report.completeness,
    state: 'insufficient',
    comparisonUnknown: [
      unknownComparison('offer.free_shipping_threshold'),
      unknownComparison('policy.return_window'),
    ],
    signals: {
      unresolved: [
        unresolvedSignal('offer.free_shipping_threshold', 'relative_numeric'),
        unresolvedSignal('policy.return_window', 'relative_numeric'),
      ],
      generationNeeded: [],
    },
    sections: {
      yourAdvantages: { state: 'unresolved', available: 0, omitted: 0 },
      competitorAdvantages: { state: 'unresolved', available: 0, omitted: 0 },
      appearsToBeWorking: { state: 'unresolved', available: 0, omitted: 0 },
      whatToTestNext: { state: 'unresolved', available: 0, omitted: 0 },
    },
  } as RawReport['completeness'];
  return parse(report);
}

/** Generation required: nothing is missing from the evidence, only from the report. */
function generationRequiredReport(): CompetitiveIntelligenceReport {
  const report = base() as RawReport & { id: string };
  report.completeness = {
    ...report.completeness,
    state: 'partial',
    signals: {
      unresolved: [],
      generationNeeded: [
        generationNeededSignal('offer.bundle', 'presence_difference'),
        generationNeededSignal('subscription.discount', 'relative_numeric'),
      ],
    },
    experiments: { unresolved: [], generationNeeded: [generationNeededExperiment()] },
  } as RawReport['completeness'];
  return parse(report);
}

/** Unresolved: a comparison that cannot be answered, shown without implying parity. */
function unresolvedReport(): CompetitiveIntelligenceReport {
  const report = base() as RawReport & { id: string };
  report.completeness = {
    ...report.completeness,
    state: 'partial',
    comparisonUnknown: [unknownComparison('policy.guarantee_duration')],
    signals: {
      unresolved: [unresolvedSignal('policy.guarantee_duration', 'relative_numeric')],
      generationNeeded: [],
    },
  } as RawReport['completeness'];
  return parse(report);
}

/** Empty section: the section stays in place and explains why it holds nothing. */
function emptySectionReport(): CompetitiveIntelligenceReport {
  const report = base() as RawReport & { id: string };
  report.sections.yourAdvantages = [];
  report.completeness = {
    ...report.completeness,
    state: 'partial',
    comparisonUnknown: [unknownComparison('policy.return_window')],
    signals: {
      unresolved: [unresolvedSignal('policy.return_window', 'relative_numeric')],
      generationNeeded: [],
    },
    sections: {
      ...report.completeness.sections,
      yourAdvantages: { state: 'unresolved', available: 1, omitted: 1 },
    },
  } as RawReport['completeness'];
  return parse(report);
}

const REPORTS: Record<string, () => CompetitiveIntelligenceReport> = {
  complete: completeReport,
  partial: partialReport,
  insufficient: insufficientReport,
  'generation-required': generationRequiredReport,
  unresolved: unresolvedReport,
  'empty-section': emptySectionReport,
};

export function previewReport(state: PreviewState): CompetitiveIntelligenceReport | null {
  return REPORTS[state]?.() ?? null;
}

export const PREVIEW_OWNED_DOMAIN = 'yourbrand.test';
export const PREVIEW_CAPTURED_AT = '2026-09-04T09:16:00.000Z';
export const PREVIEW_NOW = Date.parse('2026-09-04T14:00:00.000Z');
export const PREVIEW_CAPTURED_PAGE_TYPES = ['Homepage', 'Product page'];

/** Fixed captured records, shared with the production provenance presentation. */
export function previewEvidence(report: CompetitiveIntelligenceReport): {
  report: CompetitiveIntelligenceReport;
  evidence: ReferencedEvidence;
} {
  const copy = structuredClone(report);
  const evidence: ReferencedEvidence = {
    ownedDomain: PREVIEW_OWNED_DOMAIN,
    sources: [],
    snapshots: [],
    observations: [],
  };
  const sourceIds = new Set<string>();
  const observationIds = new Set<string>();
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  for (const item of Object.values(copy.sections).flat()) {
    for (const signal of item.provenance.signals) {
      const kind =
        signal.comparisonKey === 'policy.return_window'
          ? 0
          : signal.comparisonKey === 'subscription.available'
            ? 2
            : 1;
      for (const ref of signal.evidence) {
        const owned = ref.role === 'owned';
        const n = 900 + kind * 10 + (owned ? 0 : 1);
        ref.sourceId = uuid(n);
        ref.snapshotId = uuid(n + 100);
        const captured = owned ? '2026-09-04T09:14:00.000Z' : PREVIEW_CAPTURED_AT;
        if (!sourceIds.has(ref.sourceId)) {
          sourceIds.add(ref.sourceId);
          evidence.sources.push({
            id: ref.sourceId,
            canonical_url: `https://${owned ? evidence.ownedDomain : item.competitorName}/${kind === 0 ? 'returns' : kind === 1 ? 'offers' : 'subscription'}`,
            brand_id: copy.brandId,
            competitor_id: owned ? null : item.competitorId,
            source_type:
              kind === 0 ? 'shipping_returns' : kind === 1 ? 'pricing_offers' : 'subscription',
          });
          evidence.snapshots.push({
            id: ref.snapshotId,
            source_id: ref.sourceId,
            captured_at: captured,
          });
        }
        if (ref.observationId && !observationIds.has(ref.observationId)) {
          observationIds.add(ref.observationId);
          evidence.observations.push({
            id: ref.observationId,
            snapshot_id: ref.snapshotId,
            subject_id: owned ? copy.brandId : item.competitorId,
            fact_type:
              kind === 0
                ? 'policy.return_window'
                : kind === 1
                  ? 'offer.free_shipping'
                  : 'subscription.details',
            payload:
              kind === 0
                ? { duration: owned ? 60 : 30, unit: 'days' }
                : kind === 1
                  ? { threshold: owned ? 75 : 50 }
                  : { available: !owned },
            source_url: `https://${owned ? PREVIEW_OWNED_DOMAIN : item.competitorName}/`,
            observed_at: captured,
            confidence: ref.confidence,
          });
        }
      }
    }
  }
  return { report: copy, evidence };
}

export function previewDrawers(
  report: CompetitiveIntelligenceReport,
): Record<string, EvidenceDrawerView> {
  const fixture = previewEvidence(report);
  return buildReportProvenance(fixture.report, fixture.evidence);
}
