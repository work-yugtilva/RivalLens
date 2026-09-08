/**
 * The drawer's view of the evidence chain. This type is deliberately free of
 * source IDs, snapshot IDs, observation IDs, signal or hypothesis identifiers,
 * comparison keys, engine versions and content hashes: it is what crosses to
 * the client, so what it cannot carry it cannot leak.
 */

export type EvidenceRoleView = 'owned' | 'competitor';

export type EvidenceRowView = {
  key: string;
  role: EvidenceRoleView;
  /** Displayed in mono, e.g. "rival.test". */
  domain: string;
  /** Plain English page type, e.g. "Shipping & returns page". */
  pageType: string;
  observedFact: string;
  /** Renders italic and muted, and never as a value. */
  explicitlyAbsent: boolean;
  capturedLabel: string;
  confidenceLabel: string;
};

export type ComparedPairView = {
  ownedLabel: string;
  ownedValue: string;
  ownedUnresolved: boolean;
  competitorLabel: string;
  competitorValue: string;
  competitorUnresolved: boolean;
};

export type ProvenanceStepView =
  | { kind: 'report'; label: string; text: string }
  | { kind: 'meaning'; label: string; statement: string; uncertainty: string }
  | { kind: 'compared'; label: string; text: string; pair: ComparedPairView | null }
  | { kind: 'evidence'; label: string; rows: EvidenceRowView[]; note: string | null };

export type EvidenceDrawerView = {
  itemKey: string;
  /** "Observed fact" · "Interpretation" · "Recommended test". */
  kindLabel: string;
  title: string;
  heading: string;
  steps: ProvenanceStepView[];
  footerNote: string;
};
