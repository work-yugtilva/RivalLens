import { describe, expect, it } from 'vitest';
import completeReportJson from '../../docs/examples/competitive-report.json';
import {
  comparisonKeyLabel,
  evidenceAffordanceLabel,
  itemKindLabel,
  metricLabel,
  pageTypeLabel,
  reportPlacementSentence,
} from '../../apps/web/src/lib/overview/labels';
import {
  buildValueGrid,
  formatDifference,
  formatUnitValue,
  NOT_ESTABLISHED,
  observedFactSentence,
} from '../../apps/web/src/lib/overview/value-format';
import { buildReportView } from '../../apps/web/src/lib/overview/report-view';
import type { CompetitiveIntelligenceReport } from '../../packages/schemas/src';

const OWNED_BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const REPORT_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_HASH = `sha256:${'a'.repeat(64)}`;
const NOW = Date.parse('2026-09-04T14:00:00.000Z');

function completeReport(): CompetitiveIntelligenceReport {
  return structuredClone({
    ...completeReportJson,
    id: REPORT_ID,
  }) as unknown as CompetitiveIntelligenceReport;
}

function view(report: CompetitiveIntelligenceReport) {
  return buildReportView({
    report,
    sourcesCapturedAt: '2026-09-04T09:16:00.000Z',
    capturedPageTypes: ['Homepage', 'Product page'],
    now: NOW,
  });
}

function section(report: CompetitiveIntelligenceReport, name: string) {
  const built = view(report);
  const found = built.sections.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No section ${name}`);
  return found;
}

describe('overview value formatting', () => {
  it('renders each recorded unit in the unit the backend used', () => {
    expect(formatUnitValue(75, 'usd')).toEqual({ kind: 'value', text: '$75' });
    expect(formatUnitValue(60, 'days')).toEqual({ kind: 'value', text: '60 days' });
    expect(formatUnitValue(12.5, 'percent')).toEqual({ kind: 'value', text: '12.5%' });
    expect(formatUnitValue(3, undefined)).toEqual({ kind: 'value', text: '3' });
  });

  it('renders presence as words rather than as a boolean', () => {
    expect(formatUnitValue(true, undefined)).toEqual({ kind: 'value', text: 'Offered' });
    expect(formatUnitValue(false, undefined)).toEqual({ kind: 'value', text: 'Not offered' });
  });

  it('never renders an unresolved value as a value, a dash or a zero', () => {
    const cell = formatUnitValue(undefined, 'usd');
    expect(cell).toEqual({ kind: 'unresolved', text: NOT_ESTABLISHED });
    expect(cell.text).not.toMatch(/[-—0]/);
  });

  it('gives no difference cell when the comparison did not resolve or the values match', () => {
    expect(formatDifference(undefined, 'usd')).toBeNull();
    expect(formatDifference(0, 'usd')).toBeNull();
  });

  it('reads the delta as competitor relative to owned, with a unit-aware qualifier', () => {
    expect(formatDifference(-25, 'usd')).toEqual({
      direction: 'lower',
      amount: '$25',
      qualifier: 'lower',
    });
    expect(formatDifference(-30, 'days')).toEqual({
      direction: 'lower',
      amount: '30 days',
      qualifier: 'shorter',
    });
    expect(formatDifference(10, 'days')).toEqual({
      direction: 'higher',
      amount: '10 days',
      qualifier: 'longer',
    });
  });

  it('leaves both cells unresolved when neither side is established', () => {
    expect(buildValueGrid({ unit: 'usd' })).toEqual({
      owned: { kind: 'unresolved', text: NOT_ESTABLISHED },
      competitor: { kind: 'unresolved', text: NOT_ESTABLISHED },
      difference: null,
    });
  });

  it('describes an observed fact in plain English and marks explicit absence', () => {
    expect(
      observedFactSentence('offer.free_shipping_threshold', 'present', { threshold: 75 }),
    ).toEqual({ text: 'Free shipping on orders over $75', explicitlyAbsent: false });

    expect(observedFactSentence('subscription.available', 'explicitly_absent', null)).toEqual({
      text: 'No subscription option present — recorded as explicitly absent',
      explicitlyAbsent: true,
    });

    expect(observedFactSentence('policy.return_window', 'unknown', null)).toBeNull();
  });
});

describe('overview label mapping', () => {
  it('translates comparison keys into human labels', () => {
    expect(comparisonKeyLabel('offer.free_shipping_threshold')).toBe('Free-shipping threshold');
    expect(comparisonKeyLabel('policy.return_window')).toBe('Return window');
    expect(comparisonKeyLabel('offer.promo:SAVE20')).toBe('Promotional code');
  });

  it('never leaks a raw key, an identifier fragment or a number for an unknown key', () => {
    const label = comparisonKeyLabel('offer.mystery_thing:abc123');
    expect(label).toBe('Mystery thing');
    expect(label).not.toContain('offer.');
    expect(label).not.toContain('abc123');
    expect(comparisonKeyLabel('offer.')).toBe('Compared detail');
  });

  it('translates page types and falls back without exposing the raw source type', () => {
    expect(pageTypeLabel('shipping_returns')).toBe('Shipping & returns page');
    expect(pageTypeLabel('subscription')).toBe('Subscription page');
    expect(pageTypeLabel('some_new_type')).toBe('Captured page');
    expect(pageTypeLabel(null)).toBe('Captured page');
  });

  it('translates metrics and falls back to a neutral label', () => {
    expect(metricLabel('subscription_take_rate')).toBe('Subscription take rate');
    expect(metricLabel('not_a_metric')).toBe('Primary metric');
  });

  it('labels each item kind and its evidence affordance', () => {
    expect(itemKindLabel('competitive_fact')).toBe('Observed fact');
    expect(itemKindLabel('strategic_hypothesis')).toBe('Interpretation');
    expect(itemKindLabel('recommended_experiment')).toBe('Recommended test');

    expect(evidenceAffordanceLabel('competitive_fact')).toBe('Evidence');
    expect(evidenceAffordanceLabel('strategic_hypothesis')).toBe('Why this?');
    expect(evidenceAffordanceLabel('recommended_experiment')).toBe('Why this test?');
  });

  it('states where in the report an item sits', () => {
    expect(reportPlacementSentence('appearsToBeWorking', 'Interpretation')).toBe(
      'Listed in your report under What appears to be working, as an interpretation.',
    );
  });
});

describe('overview preview fixtures', () => {
  it('parses every report-backed preview state against the real contract', async () => {
    const { previewReport, PREVIEW_STATES } =
      await import('../../apps/web/src/lib/overview/preview-fixtures');
    for (const state of PREVIEW_STATES) {
      expect(() => previewReport(state), state).not.toThrow();
    }
  });
});

describe('overview report-view state derivation', () => {
  it('reports a complete report as complete, with no notice', () => {
    const built = view(completeReport());
    expect(built.status.state).toBe('complete');
    expect(built.status.label).toBe('Complete');
    expect(built.status.competitorCountLabel).toBe('1 competitor');
    expect(built.status.gapCountLabel).toBeNull();
    expect(built.notice).toBeNull();
    expect(built.generationNotice).toBeNull();
    expect(built.insufficient).toBeNull();
    expect(built.sections).toHaveLength(4);
  });

  it('keeps every section in order even when one is empty', () => {
    const report = completeReport();
    report.sections.yourAdvantages = [];
    report.completeness.state = 'partial';
    report.completeness.sections.yourAdvantages = {
      state: 'unresolved',
      available: 1,
      omitted: 1,
    };
    report.completeness.comparisonUnknown = [
      {
        competitorId: COMPETITOR_ID,
        comparisonKey: 'policy.return_window',
        subjectIds: [OWNED_BRAND_ID],
      },
    ];

    const built = view(report);
    expect(built.sections.map((candidate) => candidate.name)).toEqual([
      'yourAdvantages',
      'competitorAdvantages',
      'appearsToBeWorking',
      'whatToTestNext',
    ]);
    const empty = built.sections[0]!;
    expect(empty.rows).toHaveLength(0);
    expect(empty.empty).not.toBeNull();
    expect(empty.empty?.explanation).toContain('not a finding');
  });

  it('describes an unresolved comparison without implying parity', () => {
    const report = completeReport();
    report.completeness.state = 'partial';
    report.completeness.comparisonUnknown = [
      {
        competitorId: COMPETITOR_ID,
        comparisonKey: 'policy.guarantee_duration',
        subjectIds: [OWNED_BRAND_ID],
      },
    ];

    const hosted = section(report, 'competitorAdvantages');
    expect(hosted.unresolved).toHaveLength(1);
    expect(hosted.unresolved[0]!.title).toBe('Guarantee duration');
    expect(hosted.unresolved[0]!.statement).toContain('Not established');
    expect(hosted.unresolved[0]!.statement).not.toMatch(/equal|same|matches/i);
  });

  it('offers regeneration once, as a whole-report action, when new evidence is waiting', () => {
    const report = completeReport();
    report.completeness.state = 'partial';
    report.completeness.signals.generationNeeded = [
      {
        logicalIdentity: {
          ownedBrandId: OWNED_BRAND_ID,
          competitorId: COMPETITOR_ID,
          comparisonKey: 'offer.bundle',
          signalFamily: 'presence_difference',
        },
        candidateSignalHash: CANDIDATE_HASH,
        ruleVersion: 'competitive-signals-v1',
      },
    ];
    report.completeness.experiments.generationNeeded = [
      {
        logicalIdentity: {
          ownedBrandId: OWNED_BRAND_ID,
          competitorId: COMPETITOR_ID,
          hypothesisType: 'competitor_may_emphasize_repeat_purchase_mechanics',
          experimentType: 'subscription_availability',
        },
        sourceHypothesisIds: ['00000000-0000-4000-8000-000000000101'],
        candidateExperimentHash: CANDIDATE_HASH,
        experimentEngineVersion: 'recommended-experiments-v1',
      },
    ];

    const built = view(report);
    expect(built.generationNotice).not.toBeNull();
    expect(built.generationNotice?.detail).toBe(
      '1 signal and 1 experiment are waiting to be included.',
    );

    const awaiting = built.sections.flatMap((candidate) => candidate.awaitingGeneration);
    expect(awaiting.length).toBeGreaterThan(0);
    for (const row of awaiting) {
      expect(Object.keys(row).sort()).toEqual(['detail', 'key', 'statement']);
    }
  });

  it('keeps the four sections and states a reason for each when nothing resolved', () => {
    const report = completeReport();
    report.sections = {
      yourAdvantages: [],
      competitorAdvantages: [],
      appearsToBeWorking: [],
      whatToTestNext: [],
    };
    report.completeness.state = 'insufficient';
    for (const name of [
      'yourAdvantages',
      'competitorAdvantages',
      'appearsToBeWorking',
      'whatToTestNext',
    ] as const) {
      report.completeness.sections[name] = { state: 'unresolved', available: 0, omitted: 0 };
    }

    const built = view(report);
    expect(built.insufficient).not.toBeNull();
    expect(built.insufficient?.reasons.map((reason) => reason.title)).toEqual([
      'Your advantages',
      'Competitor advantages',
      'What appears to be working',
      'What to test next',
    ]);
    expect(built.insufficient?.body).toContain('Nothing here is a finding about your brand.');
  });

  it('carries no identifier, hash or raw comparison key into the view', () => {
    const report = completeReport();
    report.completeness.state = 'partial';
    report.completeness.comparisonUnknown = [
      {
        competitorId: COMPETITOR_ID,
        comparisonKey: 'policy.guarantee_duration',
        subjectIds: [OWNED_BRAND_ID],
      },
    ];

    const serialized = JSON.stringify(view(report));
    expect(serialized).not.toContain(OWNED_BRAND_ID);
    expect(serialized).not.toContain(COMPETITOR_ID);
    expect(serialized).not.toContain(REPORT_ID);
    expect(serialized).not.toContain('sha256:');
    expect(serialized).not.toContain('policy.guarantee_duration');
    expect(serialized).not.toContain('competitive-report-v1');
  });
});
