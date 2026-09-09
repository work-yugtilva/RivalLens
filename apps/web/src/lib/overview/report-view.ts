import type {
  CompetitiveIntelligenceReport,
  CompetitiveReportExperiment,
  CompetitiveReportFact,
  CompetitiveReportHypothesis,
} from '@rivallens/schemas';
import {
  comparisonKeyLabel,
  comparisonKeyPhrase,
  countWord,
  evidenceAffordanceLabel,
  experimentPhrase,
  hypothesisPhrase,
  joinClauses,
  metricLabel,
  plural,
  readinessLabel,
  SECTION_META,
  SECTION_ORDER,
  sentenceCase,
  type CompetitiveReportSectionName,
} from './labels';
import { captureRelationSentence, formatRelative } from './time';
import type {
  AwaitingGenerationRowView,
  CompletenessNoticeView,
  EmptySectionView,
  ExperimentRowView,
  FactRowView,
  GenerationNoticeView,
  HypothesisRowView,
  InsufficientView,
  ReportRowView,
  ReportStatusView,
  ReportView,
  SectionView,
  UnresolvedRowView,
} from './types';
import { buildValueGrid } from './value-format';

/**
 * Unresolved comparisons and ungenerated signals have no resolved direction, so
 * they cannot be attributed to a favouring side. They are hosted in
 * "Competitor advantages", which is where the approved partial reference
 * renders them, and the other fact section explains its own absence instead.
 */
const GAP_HOST_SECTION: CompetitiveReportSectionName = 'competitorAdvantages';

const INSUFFICIENT_REASONS: Record<CompetitiveReportSectionName, string> = {
  yourAdvantages: 'No comparison has resolved in your favour yet.',
  competitorAdvantages: 'No comparison has resolved in their favour yet.',
  appearsToBeWorking: 'Interpretations need at least one resolved signal.',
  whatToTestNext: 'Tests are derived from hypotheses, so none are available yet.',
};

const AWAITING_DETAIL = 'It has not been generated for this report yet.';

export type BuildReportViewInput = {
  report: CompetitiveIntelligenceReport;
  /** Latest capture instant across the sources in scope, when known. */
  sourcesCapturedAt?: string | null;
  /** Page types already captured, used only by the insufficient state's note. */
  capturedPageTypes?: string[];
  now: number;
};

export function buildReportView(input: BuildReportViewInput): ReportView {
  const { report } = input;
  const { completeness } = report;
  const competitorLabels = report.competitors.map((competitor) => competitor.name);
  const primaryCompetitor = competitorLabels[0] ?? 'the competitor';

  const unresolvedRows = buildUnresolvedRows(report);
  const awaitingBySection = buildAwaitingRows(report);
  const gapCount = countGaps(report);

  const sections = SECTION_ORDER.map((name) =>
    buildSection({
      name,
      report,
      unresolved: name === GAP_HOST_SECTION ? unresolvedRows : [],
      awaitingGeneration: awaitingBySection[name],
      unresolvedTitles: unresolvedRows.map((row) => row.title),
    }),
  );

  const insufficient =
    completeness.state === 'insufficient'
      ? buildInsufficient(primaryCompetitor, input.capturedPageTypes ?? [])
      : null;

  return {
    status: buildStatus({ report, gapCount, now: input.now }),
    notice: completeness.state === 'partial' ? buildNotice(report) : null,
    generationNotice: buildGenerationNotice(report),
    sections,
    insufficient,
    footerNote: captureRelationSentence(report.generatedAt, input.sourcesCapturedAt ?? null),
    ownedLabel: 'You',
    competitorLabels,
  };
}

function buildStatus(input: {
  report: CompetitiveIntelligenceReport;
  gapCount: number;
  now: number;
}): ReportStatusView {
  const { report } = input;
  const partial = report.completeness.state !== 'complete';
  const count = report.competitors.length;
  return {
    state: report.completeness.state,
    label:
      report.completeness.state === 'insufficient'
        ? 'Insufficient'
        : partial
          ? 'Partial'
          : 'Complete',
    competitorCountLabel: `${count} ${plural(count, 'competitor')}`,
    generatedLabel: `generated ${formatRelative(report.generatedAt, input.now)}`,
    gapCountLabel:
      partial && input.gapCount > 0 ? `${input.gapCount} ${plural(input.gapCount, 'gap')}` : null,
  };
}

/** Counts only the gaps the report actually renders, so the header cannot over-report. */
function countGaps(report: CompetitiveIntelligenceReport): number {
  const { completeness } = report;
  const generation =
    completeness.signals.generationNeeded.length +
    completeness.hypotheses.generationNeeded.length +
    completeness.experiments.generationNeeded.length;
  return (
    unresolvedComparisons(report).length +
    generation +
    completeness.hypotheses.unresolved.length +
    completeness.experiments.unresolved.length
  );
}

function buildNotice(report: CompetitiveIntelligenceReport): CompletenessNoticeView {
  const { completeness } = report;
  const unknown = unresolvedComparisons(report).length;
  const signals = completeness.signals.generationNeeded.length;
  const hypotheses = completeness.hypotheses.generationNeeded.length;
  const experiments = completeness.experiments.generationNeeded.length;

  const clauses: string[] = [];
  if (unknown > 0) {
    clauses.push(
      `${countWord(unknown)} ${plural(unknown, 'comparison')} could not be resolved from current evidence`,
    );
  }
  if (signals > 0) {
    clauses.push(
      `${countWord(signals)} ${plural(signals, 'comparison')} ${plural(signals, 'has', 'have')} not been turned into a finding yet`,
    );
  }
  if (hypotheses > 0) {
    clauses.push(
      `${countWord(hypotheses)} ${plural(hypotheses, 'interpretation')} ${plural(hypotheses, 'has', 'have')} not been generated yet`,
    );
  }
  if (experiments > 0) {
    clauses.push(
      `${countWord(experiments)} recommended ${plural(experiments, 'test')} ${plural(experiments, 'has', 'have')} not been generated yet`,
    );
  }
  const unresolvedHypotheses = completeness.hypotheses.unresolved.length;
  const unresolvedExperiments = completeness.experiments.unresolved.length;
  if (unresolvedHypotheses > 0) {
    clauses.push(
      `${countWord(unresolvedHypotheses)} ${plural(unresolvedHypotheses, 'interpretation')} ${plural(unresolvedHypotheses, 'is', 'are')} waiting on evidence that has not resolved`,
    );
  }
  if (unresolvedExperiments > 0) {
    clauses.push(
      `${countWord(unresolvedExperiments)} recommended ${plural(unresolvedExperiments, 'test')} ${plural(unresolvedExperiments, 'is', 'are')} waiting on evidence that has not resolved`,
    );
  }
  if (clauses.length === 0) clauses.push('Some supporting evidence is incomplete');

  return {
    title: 'This report is partial. What it does show is still verified.',
    body: `${sentenceCase(joinClauses(clauses))}. The findings below are unaffected.`,
  };
}

/**
 * Regeneration is a whole-report operation, so it is offered once, in its own
 * notice, describing everything a regeneration would pick up. Items awaiting
 * generation never carry a control of their own.
 */
function buildGenerationNotice(report: CompetitiveIntelligenceReport): GenerationNoticeView | null {
  const { completeness } = report;
  const signals = completeness.signals.generationNeeded.length;
  const hypotheses = completeness.hypotheses.generationNeeded.length;
  const experiments = completeness.experiments.generationNeeded.length;
  const total = signals + hypotheses + experiments;
  if (total === 0) return null;

  const waiting: string[] = [];
  if (signals > 0) waiting.push(`${signals} ${plural(signals, 'signal')}`);
  if (hypotheses > 0) waiting.push(`${hypotheses} ${plural(hypotheses, 'interpretation')}`);
  if (experiments > 0) waiting.push(`${experiments} ${plural(experiments, 'experiment')}`);

  return {
    title: 'New evidence has arrived since this report was generated',
    detail: `${joinClauses(waiting)} ${plural(total, 'is', 'are')} waiting to be included.`,
  };
}

/** Deduplicate the same unknown across comparison and signal projections. */
function unresolvedComparisons(report: CompetitiveIntelligenceReport) {
  const entries = new Map(
    report.completeness.comparisonUnknown.map((entry) => [
      `${entry.competitorId}:${entry.comparisonKey}`,
      entry,
    ]),
  );
  for (const { logicalIdentity } of report.completeness.signals.unresolved) {
    const { competitorId, comparisonKey } = logicalIdentity;
    const key = `${competitorId}:${comparisonKey}`;
    if (!entries.has(key)) entries.set(key, { competitorId, comparisonKey, subjectIds: [] });
  }
  return [...entries.values()];
}

function buildUnresolvedRows(report: CompetitiveIntelligenceReport): UnresolvedRowView[] {
  const competitorNameById = new Map(
    report.competitors.map((competitor) => [competitor.id, competitor.name]),
  );

  return unresolvedComparisons(report).map((unknown, index) => {
    const competitorName = competitorNameById.get(unknown.competitorId) ?? 'the competitor';
    const ownedUnknown = unknown.subjectIds.includes(report.brandId);
    const competitorUnknown = unknown.subjectIds.includes(unknown.competitorId);
    const phrase = comparisonKeyPhrase(unknown.comparisonKey);

    let reason: string;
    if (unknown.subjectIds.length === 0) {
      reason = 'the comparison could not be resolved from the captured evidence.';
    } else if (ownedUnknown && competitorUnknown) {
      reason = 'evidence has not been collected for both brands yet.';
    } else if (competitorUnknown) {
      reason = `no ${phrase} evidence has been captured for ${competitorName} yet.`;
    } else {
      reason = `no ${phrase} evidence has been captured for your brand yet.`;
    }

    return {
      key: `unresolved:${index}`,
      title: comparisonKeyLabel(unknown.comparisonKey),
      statement: `Not established — ${reason}`,
      ownedLabel: 'You',
      competitorLabel: competitorName,
    };
  });
}

function buildAwaitingRows(
  report: CompetitiveIntelligenceReport,
): Record<CompetitiveReportSectionName, AwaitingGenerationRowView[]> {
  const { completeness } = report;

  const signals = completeness.signals.generationNeeded.map((entry, index) => ({
    key: `awaiting-signal:${index}`,
    statement: `A ${comparisonKeyPhrase(entry.logicalIdentity.comparisonKey)} comparison is available from current evidence.`,
    detail: AWAITING_DETAIL,
  }));

  const hypotheses = completeness.hypotheses.generationNeeded.map((entry, index) => ({
    key: `awaiting-hypothesis:${index}`,
    statement: `A ${hypothesisPhrase(entry.logicalIdentity.hypothesisType)} interpretation is available from current signals.`,
    detail: AWAITING_DETAIL,
  }));

  const experiments = completeness.experiments.generationNeeded.map((entry, index) => ({
    key: `awaiting-experiment:${index}`,
    statement: `A ${experimentPhrase(entry.logicalIdentity.experimentType)} test is available from the ${hypothesisPhrase(entry.logicalIdentity.hypothesisType)} hypothesis.`,
    detail: AWAITING_DETAIL,
  }));

  return {
    yourAdvantages: [],
    competitorAdvantages: signals,
    appearsToBeWorking: hypotheses,
    whatToTestNext: experiments,
  };
}

function buildSection(input: {
  name: CompetitiveReportSectionName;
  report: CompetitiveIntelligenceReport;
  unresolved: UnresolvedRowView[];
  awaitingGeneration: AwaitingGenerationRowView[];
  unresolvedTitles: string[];
}): SectionView {
  const { name, report, unresolved, awaitingGeneration } = input;
  const meta = SECTION_META[name];
  const rows = buildRows(name, report);
  const omitted = report.completeness.sections[name].omitted;

  return {
    name,
    title: meta.title,
    subtitle: meta.subtitle,
    countLine: buildCountLine({
      shown: rows.length,
      omitted,
      unresolved: unresolved.length,
      awaiting: awaitingGeneration.length,
    }),
    rows,
    unresolved,
    awaitingGeneration,
    empty:
      rows.length === 0 && unresolved.length === 0 && awaitingGeneration.length === 0
        ? buildEmptySection(name, input.unresolvedTitles)
        : null,
  };
}

function buildCountLine(input: {
  shown: number;
  omitted: number;
  unresolved: number;
  awaiting: number;
}): string | null {
  const { shown, omitted, unresolved, awaiting } = input;
  const hidden = omitted + awaiting;
  if (hidden === 0 && unresolved === 0) return null;

  const clauses: string[] = [];
  if (shown > 0) {
    clauses.push(hidden > 0 ? `${shown} of ${shown + hidden} shown` : `${shown} supported`);
  }
  if (unresolved > 0) {
    clauses.push(`${unresolved} ${plural(unresolved, 'comparison')} unresolved`);
  }
  if (awaiting > 0) {
    clauses.push(`${awaiting} awaiting generation`);
  }
  return clauses.length > 0 ? clauses.join(' · ') : null;
}

function buildEmptySection(
  name: CompetitiveReportSectionName,
  unresolvedTitles: string[],
): EmptySectionView {
  const meta = SECTION_META[name];
  const isFactSection = name === 'yourAdvantages' || name === 'competitorAdvantages';

  if (isFactSection && unresolvedTitles.length > 0) {
    const phrases = unresolvedTitles.map((title) => title.charAt(0).toLowerCase() + title.slice(1));
    const count = unresolvedTitles.length;
    return {
      headline: 'No supported finding yet.',
      explanation: `The ${joinClauses(phrases)} ${plural(count, 'comparison')} ${plural(count, 'is', 'are')} still unresolved, so nothing can be listed here. ${meta.notAFinding}`,
    };
  }

  return {
    headline: 'No supported finding yet.',
    explanation: `Nothing in the current evidence resolves into this section. ${meta.notAFinding}`,
  };
}

function buildRows(
  name: CompetitiveReportSectionName,
  report: CompetitiveIntelligenceReport,
): ReportRowView[] {
  switch (name) {
    case 'yourAdvantages':
      return report.sections.yourAdvantages.map((item, index) =>
        buildFactRow(item, name, index, 'owned'),
      );
    case 'competitorAdvantages':
      return report.sections.competitorAdvantages.map((item, index) =>
        buildFactRow(item, name, index, 'competitor'),
      );
    case 'appearsToBeWorking':
      return report.sections.appearsToBeWorking.map((item, index) =>
        buildHypothesisRow(item, index),
      );
    case 'whatToTestNext':
      return report.sections.whatToTestNext.map((item, index) => buildExperimentRow(item, index));
  }
}

export function reportItemKey(section: CompetitiveReportSectionName, index: number): string {
  return `${section}:${index}`;
}

function buildFactRow(
  item: CompetitiveReportFact,
  section: 'yourAdvantages' | 'competitorAdvantages',
  index: number,
  favours: 'owned' | 'competitor',
): FactRowView {
  return {
    key: reportItemKey(section, index),
    section,
    itemType: 'competitive_fact',
    affordanceLabel: evidenceAffordanceLabel('competitive_fact'),
    title: item.title,
    statement: item.statement,
    confidence: item.confidence,
    favours,
    ownedLabel: 'You',
    competitorLabel: item.competitorName,
    values: buildValueGrid(item.supportingValues),
  };
}

function buildHypothesisRow(item: CompetitiveReportHypothesis, index: number): HypothesisRowView {
  const signalCount = item.provenance.signals.length;
  return {
    key: reportItemKey('appearsToBeWorking', index),
    section: 'appearsToBeWorking',
    itemType: 'strategic_hypothesis',
    affordanceLabel: evidenceAffordanceLabel('strategic_hypothesis'),
    eyebrow: item.title,
    statement: item.statement,
    uncertainty: item.uncertainty.statement,
    supportLine: `Based on ${signalCount} competitive ${plural(signalCount, 'signal')} · ${item.competitorName}`,
  };
}

function buildExperimentRow(item: CompetitiveReportExperiment, index: number): ExperimentRowView {
  const { experiment } = item;
  const guardrails = experiment.guardrailMetrics.length;
  const primaryMetric = metricLabel(experiment.primaryMetric.metric);

  return {
    key: reportItemKey('whatToTestNext', index),
    section: 'whatToTestNext',
    itemType: 'recommended_experiment',
    affordanceLabel: evidenceAffordanceLabel('recommended_experiment'),
    title: item.title,
    objective: item.statement,
    primaryMetric,
    guardrailLabel: `${guardrails} ${plural(guardrails, 'metric')}`,
    readiness: readinessLabel(experiment.primaryMetric.measurementReadiness),
    caveat: experiment.caveat.statement,
    mobileMetricLine: `${primaryMetric} · ${guardrails} ${plural(guardrails, 'guardrail')}`,
  };
}

function buildInsufficient(competitorName: string, capturedPageTypes: string[]): InsufficientView {
  return {
    title: 'Not enough evidence for a report yet',
    body: 'The structure below is what this report will contain. Nothing here is a finding about your brand.',
    reasons: SECTION_ORDER.map((name) => ({
      title: SECTION_META[name].title,
      reason: INSUFFICIENT_REASONS[name],
    })),
    captureNote:
      capturedPageTypes.length > 0
        ? `${joinClauses(capturedPageTypes)} captured for ${competitorName}`
        : null,
  };
}
