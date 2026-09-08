import type { CompetitiveReportSectionName, ReportItemType } from './labels';
import type { ValueGrid } from './value-format';

/**
 * The Overview view model. Nothing in this file may carry a database ID, a
 * content hash, an engine version or a raw comparison key: it is the boundary
 * between report contracts and the screen, and it crosses to the client.
 *
 * `key` is a positional address inside the rendered report ("section:index"),
 * not a persisted identifier. It is what the drawer resolves against.
 */

export type ReportItemKey = string;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

type RowBase = {
  key: ReportItemKey;
  section: CompetitiveReportSectionName;
  itemType: ReportItemType;
  affordanceLabel: string;
};

export type FactRowView = RowBase & {
  itemType: 'competitive_fact';
  title: string;
  statement: string;
  confidence: ConfidenceLevel;
  /** Indigo when the difference favours the owned brand, graphite when it does not. */
  favours: 'owned' | 'competitor';
  ownedLabel: string;
  competitorLabel: string;
  values: ValueGrid;
};

export type HypothesisRowView = RowBase & {
  itemType: 'strategic_hypothesis';
  eyebrow: string;
  statement: string;
  uncertainty: string;
  supportLine: string;
};

export type ExperimentRowView = RowBase & {
  itemType: 'recommended_experiment';
  title: string;
  objective: string;
  primaryMetric: string;
  guardrailLabel: string;
  readiness: string;
  caveat: string;
  /** Mobile collapses the metric grid to two stacked lines. */
  mobileMetricLine: string;
};

export type ReportRowView = FactRowView | HypothesisRowView | ExperimentRowView;

/** A comparison the backend could not resolve. Never interactive, never a value. */
export type UnresolvedRowView = {
  key: string;
  title: string;
  statement: string;
  ownedLabel: string;
  competitorLabel: string;
};

/**
 * Intelligence that exists but is not in this report yet. Carries no per-item
 * action: regeneration is a whole-report operation and is offered as one.
 */
export type AwaitingGenerationRowView = {
  key: string;
  statement: string;
  detail: string;
};

export type EmptySectionView = {
  headline: string;
  explanation: string;
};

export type SectionView = {
  name: CompetitiveReportSectionName;
  title: string;
  subtitle: string;
  /** "2 supported · 1 comparison unresolved", or null when nothing is omitted. */
  countLine: string | null;
  rows: ReportRowView[];
  unresolved: UnresolvedRowView[];
  awaitingGeneration: AwaitingGenerationRowView[];
  empty: EmptySectionView | null;
};

export type ReportStatusView = {
  state: 'complete' | 'partial';
  label: string;
  competitorCountLabel: string;
  generatedLabel: string;
  gapCountLabel: string | null;
};

export type CompletenessNoticeView = {
  title: string;
  body: string;
};

/**
 * Shown only when new intelligence exists that a regeneration would include.
 * The action it carries is explicitly a whole-report action; report items never
 * carry a per-item generate control.
 */
export type GenerationNoticeView = {
  title: string;
  detail: string;
};

export type InsufficientReasonView = {
  title: string;
  reason: string;
};

export type InsufficientView = {
  title: string;
  body: string;
  reasons: InsufficientReasonView[];
  captureNote: string | null;
};

export type ReportView = {
  status: ReportStatusView;
  notice: CompletenessNoticeView | null;
  generationNotice: GenerationNoticeView | null;
  sections: SectionView[];
  /** Set instead of `sections` when the report holds no supported item at all. */
  insufficient: InsufficientView | null;
  /** Drawer footer: "Report generated 4 Sept 2026 · sources captured the same morning". */
  footerNote: string;
  ownedLabel: string;
  competitorLabels: string[];
};

/** Sidebar / top bar context. Domains only — never brand or competitor IDs. */
export type ShellContextView = {
  ownedDomain: string;
  competitors: { id: string; domain: string }[];
  selectedCompetitorIds: string[];
  sourcesRefreshedLabel: string | null;
};
