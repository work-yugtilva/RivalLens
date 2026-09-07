import { describe, expect, it } from 'vitest';
import * as intelligence from '../../packages/intelligence/src';
import {
  reportInput,
  BRAND_ID,
  COMPETITOR_ID,
  GENERATED_AT,
  uuid,
} from './fixtures/competitive-reports';
import {
  competitiveIntelligenceReportCandidateSchema,
  type CompetitiveReportInput,
} from '../../packages/schemas/src';
import { hypotheses, experiments } from './fixtures/current-experiments';

const compose = intelligence.composeCompetitiveIntelligenceReport;
const shipping = (owned: number | null = 75, competitor: number | null = 50) => ({
  key: 'offer.free_shipping_threshold',
  owned: owned === null ? null : { threshold: owned },
  competitor: competitor === null ? null : { threshold: competitor },
  numeric: { field: 'threshold', unit: 'usd' as const },
});
const returns = (owned = 30, competitor = 60) => ({
  key: 'policy.return_window',
  owned: { durationDays: owned },
  competitor: { durationDays: competitor },
  numeric: { field: 'durationDays', unit: 'days' as const },
});
const guarantee = {
  key: 'policy.guarantee_duration',
  owned: { durationDays: 30 },
  competitor: { durationDays: 90 },
  numeric: { field: 'durationDays', unit: 'days' as const },
};
const subscription = {
  key: 'subscription.available',
  owned: false as const,
  competitor: { available: true },
};
const bundle = { key: 'offer.bundle', owned: false as const, competitor: { label: 'bundle' } };
const bogo = { key: 'offer.buy_x_get_y', owned: false as const, competitor: { label: 'bogo' } };
const discount = {
  key: 'offer.discount:fixed:10',
  owned: false as const,
  competitor: { type: 'fixed', amount: 10 },
};

function project(
  comparison: CompetitiveReportInput['comparison'],
  history: CompetitiveReportInput,
): CompetitiveReportInput {
  const signalProjection = intelligence.resolveCurrentCompetitiveSignals({
    comparison,
    historicalSignals: history.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const currentSignals = history.currentSignals.filter((s) =>
    signalProjection.signals.some((c) => c.signalHash === s.signalHash),
  );
  const hypothesisProjection = intelligence.resolveCurrentStrategicHypotheses({
    currentSignals,
    currentSignalUnresolved: signalProjection.unresolved,
    historicalHypotheses: history.hypothesisProjection.hypotheses,
    historicalSignals: history.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const experimentProjection = intelligence.resolveCurrentRecommendedExperiments({
    currentHypotheses: hypothesisProjection,
    supportingSignals: currentSignals,
    historicalExperiments: history.experimentProjection.experiments,
    generatedAt: GENERATED_AT,
  });
  return {
    comparison,
    signalProjection,
    currentSignals,
    hypothesisProjection,
    experimentProjection,
    generatedAt: GENERATED_AT,
  };
}

describe('competitive intelligence report composition', () => {
  it('composes persisted current shipping intelligence into factual, uncertain, and test items', () => {
    expect(intelligence).toHaveProperty('composeCompetitiveIntelligenceReport');
    const report = intelligence.composeCompetitiveIntelligenceReport(reportInput());
    expect(report.sections.yourAdvantages).toEqual([]);
    expect(report.sections.competitorAdvantages).toHaveLength(1);
    expect(report.sections.appearsToBeWorking[0]?.itemType).toBe('strategic_hypothesis');
    expect(report.sections.appearsToBeWorking[0]?.statement).toContain('may');
    expect(report.sections.whatToTestNext[0]?.experiment.primaryMetric.measurementReadiness).toBe(
      'requires_first_party_data',
    );
    expect(report.completeness.state).toBe('complete');
  });

  it.each([
    [
      'owned shipping',
      shipping(50, 75),
      'yourAdvantages',
      'competitor_higher_free_shipping_threshold',
    ],
    ['owned returns', returns(60, 30), 'yourAdvantages', 'competitor_shorter_return_window'],
    [
      'owned subscription',
      { ...subscription, owned: { available: true }, competitor: false },
      'yourAdvantages',
      'owned_offers_subscription_competitor_does_not',
    ],
    [
      'competitor shipping',
      shipping(),
      'competitorAdvantages',
      'competitor_lower_free_shipping_threshold',
    ],
    ['competitor returns', returns(), 'competitorAdvantages', 'competitor_longer_return_window'],
    [
      'competitor subscription',
      subscription,
      'competitorAdvantages',
      'competitor_offers_subscription_owned_does_not',
    ],
    ['bundle', bundle, 'competitorAdvantages', 'competitor_offers_bundle_owned_does_not'],
    ['BOGO', bogo, 'competitorAdvantages', 'competitor_offers_bogo_owned_does_not'],
    [
      'discount',
      discount,
      'competitorAdvantages',
      'competitor_offers_explicit_discount_owned_does_not',
    ],
  ] as const)('presents %s as an explicit comparative fact', (_name, fact, section, type) => {
    const report = compose(reportInput([fact]));
    expect(report.sections[section]).toHaveLength(1);
    expect(report.sections[section][0]?.signalType).toBe(type);
    expect(report.sections[section][0]?.provenance.signals).toHaveLength(1);
  });

  it.each([null, 50])('does not turn unknown or equal shipping into an advantage (%s)', (value) => {
    const report = compose(reportInput([shipping(50, value)]));
    expect(Object.values(report.sections).flat()).toEqual([]);
    expect(report.completeness.state).toBe('insufficient');
    expect(report.completeness.sections.competitorAdvantages.state).toBe(
      value === null ? 'unresolved' : 'no_supported_finding',
    );
  });

  it.each([subscription, bundle, discount])('retains hypothesis uncertainty for $key', (fact) => {
    const input = reportInput([fact]);
    const report = compose(input);
    expect(report.sections.appearsToBeWorking[0]?.statement).toBe(
      input.hypothesisProjection.hypotheses[0]?.statement,
    );
    expect(report.sections.appearsToBeWorking[0]?.uncertainty).toEqual(
      input.hypothesisProjection.hypotheses[0]?.uncertainty,
    );
    expect(report.sections.appearsToBeWorking[0]?.statement).toMatch(/may/);
  });

  it.each([returns(), guarantee])('preserves policy operational review for $key', (fact) => {
    const report = compose(reportInput([fact]));
    expect(report.sections.whatToTestNext[0]?.experiment.treatment).toHaveProperty(
      'operationalReviewRequired',
      true,
    );
  });

  it('preserves subscription metric readiness and experiment rationale confidence', () => {
    const input = reportInput([subscription]);
    const experiment = compose(input).sections.whatToTestNext[0]!.experiment;
    expect(experiment).toEqual(input.experimentProjection.experiments[0]);
    expect(
      [experiment.primaryMetric, ...experiment.guardrailMetrics].every(
        (m) => m.measurementReadiness === 'requires_first_party_data',
      ),
    ).toBe(true);
    expect(experiment.confidence.basis).toBe('support_for_testing_rationale');
    expect(experiment.durationPlanning.status).toBe('requires_first_party_data');
  });

  it('caps all populated sections at three and exposes omitted counts with reproducible ordering', () => {
    const input = reportInput([
      shipping(),
      returns(),
      guarantee,
      subscription,
      bundle,
      bogo,
      discount,
    ]);
    const report = compose(input);
    for (const name of ['competitorAdvantages', 'appearsToBeWorking', 'whatToTestNext'] as const) {
      expect(report.sections[name]).toHaveLength(3);
      expect(report.completeness.sections[name].omitted).toBeGreaterThan(0);
    }
    const reordered = structuredClone(input);
    reordered.comparison.facts.reverse();
    reordered.signalProjection.signals.reverse();
    reordered.currentSignals.reverse();
    reordered.hypothesisProjection.hypotheses.reverse();
    reordered.experimentProjection.experiments.reverse();
    for (const s of reordered.currentSignals) s.evidence.reverse();
    expect(compose(reordered)).toEqual(report);
    const owned = reportInput([
      shipping(50, 75),
      returns(60, 30),
      { ...guarantee, owned: { durationDays: 120 } },
      { ...subscription, owned: { available: true }, competitor: false },
      { ...bundle, owned: { label: 'bundle' }, competitor: false },
    ]);
    expect(compose(owned).sections.yourAdvantages).toHaveLength(3);
  });

  it('prefers confidence before fixed family order without inventing scores', () => {
    const input = reportInput([shipping(), returns()]);
    const shippingSignal = input.currentSignals.find(
      (s) => s.comparisonKey === 'offer.free_shipping_threshold',
    )!;
    shippingSignal.confidence = 'low';
    input.signalProjection.signals.find(
      (s) => s.signalHash === shippingSignal.signalHash,
    )!.confidence = 'low';
    const report = compose(input);
    expect(report.sections.competitorAdvantages[0]?.title).toBe('Return window');
    expect(report).not.toHaveProperty('opportunityScore');
  });

  it('records unpersisted signal candidates without fabricating downstream intelligence', () => {
    const input = reportInput();
    input.currentSignals = [];
    input.hypothesisProjection.hypotheses = [];
    input.experimentProjection.experiments = [];
    const report = compose(input);
    expect(Object.values(report.sections).flat()).toEqual([]);
    expect(report.completeness.signals.generationNeeded[0]?.candidateSignalHash).toBe(
      input.signalProjection.signals[0]?.signalHash,
    );
    expect(report.completeness.sections.whatToTestNext.state).toBe('generation_required');
  });

  it('propagates hypothesis and experiment generation gaps until each explicit persistence step', () => {
    const original = reportInput();
    const noHypotheses = {
      ...original,
      hypothesisProjection: { ...original.hypothesisProjection, hypotheses: [] },
      experimentProjection: { ...original.experimentProjection, experiments: [] },
    };
    const needed = compose(project(original.comparison, noHypotheses));
    expect(needed.completeness.state).toBe('partial');
    expect(needed.completeness.hypotheses.generationNeeded).toHaveLength(1);
    expect(needed.sections.appearsToBeWorking).toEqual([]);
    const noExperiments = {
      ...original,
      experimentProjection: { ...original.experimentProjection, experiments: [] },
    };
    const pending = compose(project(original.comparison, noExperiments));
    expect(pending.completeness.experiments.generationNeeded[0]?.sourceHypothesisIds).toEqual([
      original.hypothesisProjection.hypotheses[0]!.id,
    ]);
    expect(pending.sections.appearsToBeWorking).toHaveLength(1);
    expect(pending.sections.whatToTestNext).toEqual([]);
    expect(compose(original).completeness.state).toBe('complete');
    expect(
      new Set([needed.reportHash, pending.reportHash, compose(original).reportHash]).size,
    ).toBe(3);
  });

  it('propagates all unresolved layers, omits stale items, and distinguishes equality', () => {
    const original = reportInput();
    const unknown = compose(project(reportInput([shipping(75, null)]).comparison, original));
    expect(unknown.completeness.signals.unresolved).toHaveLength(1);
    expect(unknown.completeness.hypotheses.unresolved).toHaveLength(1);
    expect(unknown.completeness.experiments.unresolved).toHaveLength(1);
    expect(unknown.sourceIntelligence).toEqual({
      signalIds: [],
      hypothesisIds: [],
      experimentIds: [],
    });
    expect(Object.values(unknown.sections).flat()).toEqual([]);
    expect(unknown.completeness.sections.whatToTestNext.state).toBe('unresolved');
    const equal = compose(project(reportInput([shipping(75, 75)]).comparison, original));
    expect(equal.completeness.experiments.unresolved).toEqual([]);
    expect(equal.completeness.sections.whatToTestNext.state).toBe('no_supported_finding');
    expect(unknown.reportHash).not.toBe(equal.reportHash);
  });

  it('marks supported intelligence partial when a different comparison is unknown', () => {
    const report = compose(
      reportInput([
        shipping(),
        { key: 'policy.return_window', owned: null, competitor: { durationDays: 60 } },
      ]),
    );
    expect(report.completeness.state).toBe('partial');
    expect(report.completeness.comparisonUnknown[0]?.subjectIds).toEqual([BRAND_ID]);
    expect(report.sections.competitorAdvantages).toHaveLength(1);
  });

  it('does not present old experiments during reversal or reappearance with new lineage', () => {
    const original = reportInput();
    const reversed = project(reportInput([shipping(50, 75)]).comparison, original);
    expect(compose(reversed).sections.whatToTestNext).toEqual([]);
    const returned = reportInput();
    returned.comparison.facts[0]!.valuesBySubjectId[COMPETITOR_ID]!.provenance!.snapshotId =
      uuid(777);
    let pending = project(returned.comparison, original);
    expect(compose(pending).completeness.signals.generationNeeded).toHaveLength(1);
    pending.currentSignals = pending.signalProjection.signals.map((s, i) => ({
      ...s,
      id: uuid(500 + i),
    }));
    pending = project(returned.comparison, { ...original, currentSignals: pending.currentSignals });
    expect(compose(pending).completeness.hypotheses.generationNeeded).toHaveLength(1);
    pending.hypothesisProjection.hypotheses = hypotheses(pending.currentSignals, 600);
    pending = project(returned.comparison, {
      ...pending,
      experimentProjection: original.experimentProjection,
    });
    expect(compose(pending).completeness.experiments.generationNeeded).toHaveLength(1);
    const newExperiments = experiments(
      pending.currentSignals,
      pending.hypothesisProjection.hypotheses,
      700,
    );
    pending.experimentProjection.experiments = newExperiments;
    pending.experimentProjection.generationNeeded = [];
    const report = compose(pending);
    expect(report.sections.whatToTestNext[0]?.experiment.id).toBe(uuid(700));
    expect(report.sourceIntelligence.experimentIds).not.toContain(
      original.experimentProjection.experiments[0]!.id,
    );
    expect(original.experimentProjection.experiments).toHaveLength(1);
  });

  it('retains exact graph edges and evidence with no recomputation needed to show evidence', () => {
    const input = reportInput();
    const report = compose(input);
    const provenance = report.sections.whatToTestNext[0]!.provenance;
    expect(provenance.experiments).toEqual([
      {
        experimentId: input.experimentProjection.experiments[0]!.id,
        sourceHypothesisIds: input.experimentProjection.experiments[0]!.sourceHypothesisIds,
      },
    ]);
    expect(provenance.hypotheses).toEqual([
      {
        hypothesisId: input.hypothesisProjection.hypotheses[0]!.id,
        supportingSignalIds: input.hypothesisProjection.hypotheses[0]!.supportingSignalIds,
      },
    ]);
    expect(provenance.signals[0]?.evidence).toEqual(
      expect.arrayContaining(input.currentSignals[0]!.evidence),
    );
  });

  it.each(['signal', 'hypothesis', 'experiment'] as const)('rejects stale %s lineage', (layer) => {
    const input = reportInput();
    if (layer === 'signal') input.signalProjection.signals = [];
    if (layer === 'hypothesis')
      input.hypothesisProjection.hypotheses[0]!.supportingSignalIds = [uuid(999)];
    if (layer === 'experiment')
      input.experimentProjection.experiments[0]!.sourceHypothesisIds = [uuid(999)];
    expect(() => compose(input)).toThrow(/current/);
  });

  it('excludes generic promotions and positioning from advantages or new experiments', () => {
    const input = reportInput([
      { key: 'offer.promo:sale', owned: false, competitor: { label: 'sale' } },
      { key: 'positioning.homepage.headline', owned: { text: 'One' }, competitor: { text: 'Two' } },
    ]);
    const report = compose(input);
    expect(report.sections.yourAdvantages).toEqual([]);
    expect(report.sections.competitorAdvantages).toEqual([]);
    expect(report.sections.whatToTestNext).toEqual([]);
  });

  it('has timestamp-independent identity but preserves evidence revisions and engine version identity', () => {
    const input = reportInput(),
      original = compose(input);
    const later = structuredClone(input);
    later.generatedAt = '2026-09-05T00:00:00.000Z';
    later.comparison.generatedAt = later.generatedAt;
    later.signalProjection.signals.forEach((s) => (s.generatedAt = later.generatedAt));
    expect(compose(later).reportHash).toBe(original.reportHash);
    expect(
      intelligence.competitiveReportHash(original.sourceStateHash, 'competitive-report-v2'),
    ).not.toBe(original.reportHash);
    later.comparison.facts[0]!.valuesBySubjectId[COMPETITOR_ID]!.provenance!.observedAt =
      later.generatedAt;
    expect(compose(later).reportHash).not.toBe(original.reportHash);
  });

  it('includes competitor selection in identity and rejects injected scope', () => {
    const input = reportInput();
    const first = compose(input);
    input.comparison.competitors.push({
      subjectType: 'competitor',
      subjectId: uuid(800),
      domain: 'second.test',
    });
    expect(compose(input).reportHash).not.toBe(first.reportHash);
    input.currentSignals[0]!.competitorId = uuid(801);
    expect(() => compose(input)).toThrow(/scope/);
  });

  it('validates strict contracts and never allows performance claims on hypothesis items', () => {
    const report = compose(reportInput());
    expect(
      competitiveIntelligenceReportCandidateSchema.safeParse({ ...report, revenue: 1000 }).success,
    ).toBe(false);
    report.sections.appearsToBeWorking[0]!.statement =
      'This strategy increased conversion and revenue.';
    expect(competitiveIntelligenceReportCandidateSchema.safeParse(report).success).toBe(false);
  });

  it('rejects a signal projection that carries evidence superseded by its comparison', () => {
    const input = reportInput();
    input.comparison.facts[0]!.valuesBySubjectId[COMPETITOR_ID] = {
      state: 'unknown',
      value: null,
      provenance: null,
    };
    expect(() => compose(input)).toThrow(/comparison/);
  });

  it('includes subscription discount and explicit percentage mechanics without conflating units', () => {
    const subscriptionInput = reportInput([
      { ...subscription, owned: { available: true } },
      {
        key: 'subscription.discount',
        owned: { discountPercent: 5 },
        competitor: { discountPercent: 10 },
        numeric: { field: 'discountPercent', unit: 'percent' },
      },
    ]);
    expect(compose(subscriptionInput).sections.whatToTestNext[0]?.experiment.experimentType).toBe(
      'subscription_discount',
    );
    const percentageInput = reportInput([
      {
        key: 'offer.discount:percentage:10',
        owned: { type: 'percentage', amount: 10 },
        competitor: false,
      },
      {
        key: 'offer.discount:percentage:20',
        owned: false,
        competitor: { type: 'percentage', amount: 20 },
      },
    ]);
    const report = compose(percentageInput);
    expect(
      report.sections.competitorAdvantages.some(
        (item) => item.signalType === 'competitor_higher_explicit_percentage_discount',
      ),
    ).toBe(true);
    expect(report.sections.whatToTestNext[0]?.experiment.experimentType).toBe('explicit_discount');
    expect(report.sections.whatToTestNext[0]?.experiment.treatment).toHaveProperty(
      'discountKind',
      'percentage',
    );
  });

  it('does not label a report complete while it contains unresolved metadata', () => {
    const input = reportInput([
      shipping(),
      { key: 'policy.return_window', owned: null, competitor: null },
    ]);
    const report = compose(input);
    report.completeness.state = 'complete';
    expect(competitiveIntelligenceReportCandidateSchema.safeParse(report).success).toBe(false);
  });
});
