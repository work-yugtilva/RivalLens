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
import { itemKindLabel, reportPlacementSentence } from './labels';
import type { EvidenceDrawerView } from './provenance-types';
import { reportItemKey } from './report-view';
import type { ReportView } from './types';

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
      whatToTestNext: { state: 'supported', available: 2, omitted: 1 },
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

/**
 * Drawer views for the previewed report, derived from the rendered rows rather
 * than from the database, so the drawer's proportions and hierarchy can be
 * compared against overview-evidence-drawer.html without Supabase.
 */
export function previewDrawers(view: ReportView): Record<string, EvidenceDrawerView> {
  const drawers: Record<string, EvidenceDrawerView> = {};

  for (const section of view.sections) {
    section.rows.forEach((row, index) => {
      const kindLabel = itemKindLabel(row.itemType);
      const key = reportItemKey(section.name, index);
      const title = row.itemType === 'strategic_hypothesis' ? row.eyebrow : row.title;

      drawers[key] = {
        itemKey: key,
        kindLabel,
        title,
        heading: 'Why RivalLens is telling you this',
        steps: [
          {
            kind: 'report',
            label: 'What the report says',
            text:
              row.itemType === 'competitive_fact'
                ? row.statement
                : reportPlacementSentence(section.name, kindLabel),
          },
          ...(row.itemType === 'strategic_hypothesis'
            ? ([
                {
                  kind: 'meaning' as const,
                  label: 'What it might mean',
                  statement: row.statement,
                  uncertainty: row.uncertainty,
                },
              ] as const)
            : []),
          {
            kind: 'compared',
            label: 'What we compared',
            text:
              row.itemType === 'competitive_fact'
                ? row.statement
                : 'Free-shipping threshold — the competitor’s threshold is lower than yours.',
            pair:
              row.itemType === 'competitive_fact'
                ? {
                    ownedLabel: row.ownedLabel,
                    ownedValue: row.values.owned.text,
                    ownedUnresolved: row.values.owned.kind === 'unresolved',
                    competitorLabel: row.competitorLabel,
                    competitorValue: row.values.competitor.text,
                    competitorUnresolved: row.values.competitor.kind === 'unresolved',
                  }
                : {
                    ownedLabel: 'You',
                    ownedValue: '$75',
                    ownedUnresolved: false,
                    competitorLabel: 'rival.test',
                    competitorValue: '$50',
                    competitorUnresolved: false,
                  },
          },
          {
            kind: 'evidence',
            label: 'What we saw',
            rows:
              row.itemType === 'competitive_fact'
                ? [
                    {
                      key: 'owned',
                      role: 'owned' as const,
                      domain: PREVIEW_OWNED_DOMAIN,
                      pageType: 'Shipping & returns page',
                      observedFact: row.values.owned.text,
                      explicitlyAbsent: row.values.owned.kind === 'unresolved',
                      capturedLabel: '4 Sept 2026, 09:14',
                      confidenceLabel: 'Confidence 95%',
                    },
                    {
                      key: 'competitor',
                      role: 'competitor' as const,
                      domain: row.competitorLabel,
                      pageType: 'Shipping & returns page',
                      observedFact: row.values.competitor.text,
                      explicitlyAbsent: row.values.competitor.kind === 'unresolved',
                      capturedLabel: '4 Sept 2026, 09:16',
                      confidenceLabel: 'Confidence 95%',
                    },
                  ]
                : [
                    {
                      key: 'owned',
                      role: 'owned' as const,
                      domain: PREVIEW_OWNED_DOMAIN,
                      pageType: 'Shipping & returns page',
                      observedFact: 'Free shipping on orders over $75',
                      explicitlyAbsent: false,
                      capturedLabel: '4 Sept 2026, 09:14',
                      confidenceLabel: 'Confidence 95%',
                    },
                    {
                      key: 'competitor',
                      role: 'competitor' as const,
                      domain: 'rival.test',
                      pageType: 'Shipping & returns page',
                      observedFact: 'Free shipping on orders over $50',
                      explicitlyAbsent: false,
                      capturedLabel: '4 Sept 2026, 09:16',
                      confidenceLabel: 'Confidence 95%',
                    },
                  ],
            note: null,
          },
        ],
        footerNote: view.footerNote,
      };
    });
  }

  return drawers;
}
