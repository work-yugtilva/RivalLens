import type {
  BrandComparisonResult,
  CompetitiveIntelligenceReport,
  ComparisonFact,
  ComparisonSubjectValue,
} from '@rivallens/schemas';
import { comparisonForItem, type ReferencedEvidence } from './provenance-evidence';
import {
  comparisonKeyLabel,
  comparisonKeyPhrase,
  comparisonKeySubject,
  itemKindLabel,
  pageTypeLabel,
  reportPlacementSentence,
  SECTION_ORDER,
  type CompetitiveReportSectionName,
} from './labels';
import type {
  ComparedPairView,
  EvidenceDrawerView,
  EvidenceRowView,
  ProvenanceStepView,
} from './provenance-types';
import { captureRelationSentence, formatDateTime } from './time';
import { NOT_ESTABLISHED, formatUnitValue, observedFactSentence } from './value-format';
import { reportItemKey } from './report-view';

const HEADING = 'Why RivalLens is telling you this';

const EVIDENCE_UNAVAILABLE =
  'The captured evidence behind this finding is no longer available to display.';

type ReportSections = CompetitiveIntelligenceReport['sections'];
type ReportItem =
  | ReportSections['yourAdvantages'][number]
  | ReportSections['appearsToBeWorking'][number]
  | ReportSections['whatToTestNext'][number];

/** Keyed by `reportItemKey(section, index)`. */
export type ReportProvenance = Record<string, EvidenceDrawerView>;

export type StoredMeaning = { competitorId: string; statement: string; uncertainty: string };

export function buildReportProvenance(
  report: CompetitiveIntelligenceReport,
  records: ReferencedEvidence,
  meanings: Map<string, StoredMeaning> = new Map(),
): ReportProvenance {
  const pageTypeBySourceId = new Map(
    records.sources.map((source) => [source.id, pageTypeLabel(source.source_type)]),
  );
  const provenance: ReportProvenance = {};
  for (const section of SECTION_ORDER) {
    report.sections[section].forEach((item, index) => {
      const itemKey = reportItemKey(section, index);
      provenance[itemKey] = buildDrawer({
        report,
        item,
        section,
        itemKey,
        comparison: comparisonForItem(report, item, records),
        pageTypeBySourceId,
        meanings,
      });
    });
  }
  return provenance;
}

export function unavailableReportProvenance(
  report: CompetitiveIntelligenceReport,
): ReportProvenance {
  return buildReportProvenance(report, {
    ownedDomain: 'Your brand',
    sources: [],
    snapshots: [],
    observations: [],
  });
}

function buildDrawer(input: {
  report: CompetitiveIntelligenceReport;
  item: ReportItem;
  section: CompetitiveReportSectionName;
  itemKey: string;
  comparison: BrandComparisonResult;
  pageTypeBySourceId: Map<string, string>;
  meanings: Map<string, StoredMeaning>;
}): EvidenceDrawerView {
  const { comparison, item, report, section } = input;

  const competitorDomain =
    comparison.competitors.find((candidate) => candidate.subjectId === item.competitorId)?.domain ??
    item.competitorName;
  const comparisonKeys = [
    ...new Set(item.provenance.signals.map((signal) => signal.comparisonKey)),
  ];

  const steps: ProvenanceStepView[] = [
    {
      kind: 'report',
      label: 'What the report says',
      text:
        item.itemType === 'competitive_fact'
          ? item.statement
          : reportPlacementSentence(section, itemKindLabel(item.itemType)),
    },
  ];

  const meaning = buildMeaningStep(report, item, input.meanings);
  if (meaning) steps.push(meaning);

  const compared = buildComparedStep({ comparison, comparisonKeys, item, competitorDomain });
  if (compared) steps.push(compared);

  const rows: EvidenceRowView[] = [];
  const capturedAt: string[] = [];
  for (const comparisonKey of comparisonKeys) {
    const fact = uniqueFact(comparison, comparisonKey);
    if (!fact) continue;
    const resolved = evidenceRowsForFact({
      fact,
      comparisonKey,
      ownedSubjectId: comparison.ownedSubject.subjectId,
      ownedDomain: comparison.ownedSubject.domain,
      competitorSubjectId: item.competitorId,
      competitorDomain,
      pageTypeBySourceId: input.pageTypeBySourceId,
    });
    rows.push(...resolved.rows);
    capturedAt.push(...resolved.capturedAt);
  }

  steps.push({
    kind: 'evidence',
    label: 'What we saw',
    rows: rows.map((row, index) => ({ ...row, key: `evidence:${index}` })),
    note: rows.length < comparisonKeys.length * 2 ? EVIDENCE_UNAVAILABLE : null,
  });

  const latestCapture = capturedAt.reduce<string | null>(
    (latest, instant) => (!latest || instant > latest ? instant : latest),
    null,
  );

  return {
    itemKey: input.itemKey,
    kindLabel: itemKindLabel(item.itemType),
    title: item.title,
    heading: HEADING,
    steps,
    footerNote: captureRelationSentence(report.generatedAt, latestCapture),
  };
}

function buildMeaningStep(
  report: CompetitiveIntelligenceReport,
  item: ReportItem,
  meanings: Map<string, StoredMeaning>,
): ProvenanceStepView | null {
  if (item.itemType === 'strategic_hypothesis') {
    return {
      kind: 'meaning',
      label: 'What it might mean',
      statement: item.statement,
      uncertainty: item.uncertainty.statement,
    };
  }
  if (item.itemType !== 'recommended_experiment') return null;

  // An experiment's interpretation step is the hypothesis it came from. The
  // canonical copy comes from the report or its exact stored parent reference.
  const sourceIds = new Set(item.provenance.hypotheses.map((entry) => entry.hypothesisId));
  const source = report.sections.appearsToBeWorking.find(
    (candidate) =>
      candidate.competitorId === item.competitorId &&
      candidate.provenance.hypotheses.some((entry) => sourceIds.has(entry.hypothesisId)),
  );
  if (!source) {
    const stored = [...sourceIds]
      .map((id) => meanings.get(id))
      .find((entry) => entry?.competitorId === item.competitorId);
    return stored
      ? {
          kind: 'meaning',
          label: 'What it might mean',
          statement: stored.statement,
          uncertainty: stored.uncertainty,
        }
      : null;
  }

  return {
    kind: 'meaning',
    label: 'What it might mean',
    statement: source.statement,
    uncertainty: source.uncertainty.statement,
  };
}

function uniqueFact(
  comparison: BrandComparisonResult,
  comparisonKey: string,
): ComparisonFact | null {
  const matches = comparison.facts.filter((fact) => fact.key === comparisonKey);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function buildComparedStep(input: {
  comparison: BrandComparisonResult;
  comparisonKeys: string[];
  item: ReportItem;
  competitorDomain: string;
}): ProvenanceStepView | null {
  const { comparison, comparisonKeys, item } = input;
  const primaryKey = comparisonKeys[0];
  if (!primaryKey) return null;

  const isFact = item.itemType === 'competitive_fact';
  const pair = isFact
    ? pairFromSupportingValues(item.supportingValues, item.competitorName)
    : pairFromComparison(comparison, primaryKey, item.competitorId, input.competitorDomain);

  const sentence = comparedSentence({
    comparison,
    comparisonKey: primaryKey,
    competitorSubjectId: item.competitorId,
    competitorLabel: isFact ? item.competitorName : input.competitorDomain,
    short: !isFact,
  });

  // A fact's drawer title is already the comparison label, so only the derived
  // items repeat it in front of the sentence.
  const text = isFact ? sentence : `${comparisonKeyLabel(primaryKey)} — ${lowerFirst(sentence)}`;
  const suffix =
    comparisonKeys.length > 1
      ? ` ${comparisonKeys.length} comparisons support this; the first is shown here.`
      : '';

  return { kind: 'compared', label: 'What we compared', text: `${text}${suffix}`, pair };
}

function comparedSentence(input: {
  comparison: BrandComparisonResult;
  comparisonKey: string;
  competitorSubjectId: string;
  competitorLabel: string;
  short: boolean;
}): string {
  const { comparisonKey, competitorLabel } = input;
  const subject = input.short
    ? comparisonKeySubject(comparisonKey)
    : comparisonKeyPhrase(comparisonKey);
  const fact = uniqueFact(input.comparison, comparisonKey);
  const delta = fact?.numericDeltas?.find(
    (candidate) => candidate.competitorSubjectId === input.competitorSubjectId,
  );

  if (delta && delta.difference !== 0) {
    const qualifier = deltaQualifier(delta.unit, delta.competitorValue < delta.ownedValue);
    return `The competitor's ${subject} is ${qualifier} than yours.`;
  }

  const owned = fact?.valuesBySubjectId[input.comparison.ownedSubject.subjectId];
  const competitor = fact?.valuesBySubjectId[input.competitorSubjectId];
  if (competitor?.state === 'present' && owned?.state === 'explicitly_absent') {
    return `${competitorLabel} shows a ${subject} where your brand explicitly does not.`;
  }
  if (owned?.state === 'present' && competitor?.state === 'explicitly_absent') {
    return `Your brand shows a ${subject} where ${competitorLabel} explicitly does not.`;
  }
  if (!owned || !competitor || owned.state === 'unknown' || competitor.state === 'unknown') {
    return 'The captured comparison is not fully available to display.';
  }
  return `The ${subject} differs between your brand and ${competitorLabel}.`;
}

function deltaQualifier(unit: 'usd' | 'days' | 'percent', competitorLower: boolean): string {
  if (unit === 'days') return competitorLower ? 'shorter' : 'longer';
  return competitorLower ? 'lower' : 'higher';
}

function pairFromSupportingValues(
  values: Extract<ReportItem, { itemType: 'competitive_fact' }>['supportingValues'],
  competitorLabel: string,
): ComparedPairView {
  const owned = formatUnitValue(values.owned, values.unit);
  const competitor = formatUnitValue(values.competitor, values.unit);
  return {
    ownedLabel: 'You',
    ownedValue: owned.text,
    ownedUnresolved: owned.kind === 'unresolved',
    competitorLabel,
    competitorValue: competitor.text,
    competitorUnresolved: competitor.kind === 'unresolved',
  };
}

function pairFromComparison(
  comparison: BrandComparisonResult,
  comparisonKey: string,
  competitorSubjectId: string,
  competitorLabel: string,
): ComparedPairView | null {
  const fact = uniqueFact(comparison, comparisonKey);
  if (!fact) return null;

  const delta = fact.numericDeltas?.find(
    (candidate) => candidate.competitorSubjectId === competitorSubjectId,
  );
  if (delta) {
    return {
      ownedLabel: 'You',
      ownedValue: formatUnitValue(delta.ownedValue, delta.unit).text,
      ownedUnresolved: false,
      competitorLabel,
      competitorValue: formatUnitValue(delta.competitorValue, delta.unit).text,
      competitorUnresolved: false,
    };
  }

  const owned = presenceValue(fact.valuesBySubjectId[comparison.ownedSubject.subjectId]);
  const competitor = presenceValue(fact.valuesBySubjectId[competitorSubjectId]);
  return {
    ownedLabel: 'You',
    ownedValue: owned.text,
    ownedUnresolved: owned.unresolved,
    competitorLabel,
    competitorValue: competitor.text,
    competitorUnresolved: competitor.unresolved,
  };
}

function presenceValue(value: ComparisonSubjectValue | undefined): {
  text: string;
  unresolved: boolean;
} {
  if (value?.state === 'present') return { text: 'Offered', unresolved: false };
  if (value?.state === 'explicitly_absent') return { text: 'Not offered', unresolved: false };
  return { text: NOT_ESTABLISHED, unresolved: true };
}

function evidenceRowsForFact(input: {
  fact: ComparisonFact;
  comparisonKey: string;
  ownedSubjectId: string;
  ownedDomain: string;
  competitorSubjectId: string;
  competitorDomain: string;
  pageTypeBySourceId: Map<string, string>;
}): { rows: EvidenceRowView[]; capturedAt: string[] } {
  const subjects: Array<{ role: 'owned' | 'competitor'; subjectId: string; domain: string }> = [
    { role: 'owned', subjectId: input.ownedSubjectId, domain: input.ownedDomain },
    { role: 'competitor', subjectId: input.competitorSubjectId, domain: input.competitorDomain },
  ];

  const rows: EvidenceRowView[] = [];
  const capturedAt: string[] = [];

  for (const { role, subjectId, domain } of subjects) {
    const value = input.fact.valuesBySubjectId[subjectId];
    if (!value?.provenance) continue;

    const observed = observedFactSentence(input.comparisonKey, value.state, value.value);
    if (!observed) continue;

    capturedAt.push(value.provenance.observedAt);
    rows.push({
      // Re-keyed positionally by the caller; the comparison key never reaches the DOM.
      key: role,
      role,
      domain,
      pageType: input.pageTypeBySourceId.get(value.provenance.sourceId) ?? pageTypeLabel(null),
      observedFact: observed.text,
      explicitlyAbsent: observed.explicitlyAbsent,
      capturedLabel: formatDateTime(value.provenance.observedAt),
      confidenceLabel: `Confidence ${Math.round(value.provenance.confidence * 100)}%`,
    });
  }

  return { rows, capturedAt };
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
