import { createHash } from 'node:crypto';
import {
  DEFAULT_INTELLIGENCE_CONTEXT_LIMITS,
  intelligenceContextSchema,
  type AnalysisObjective,
  type BrandComparisonResult,
  type ContextComparisonFact,
  type ContextObservedChange,
  type ContextSignal,
  type ContextSignalEvidenceReference,
  type ContextSubject,
  type ContextUntrustedSnippet,
  type IntelligenceContext,
  type ObservedChange,
  type Signal,
} from '@rivallens/schemas';
import type { EvidenceEnrichedObservedChange } from './signals';

export type BuildIntelligenceContextInput = {
  comparison: BrandComparisonResult;
  signals: Signal[];
  observedChanges?: Array<ObservedChange | EvidenceEnrichedObservedChange>;
  untrustedSnippets?: ContextUntrustedSnippet[];
  analysisObjective?: AnalysisObjective;
  includeSnippets?: boolean;
  generatedAt?: string;
  limits?: Partial<typeof DEFAULT_INTELLIGENCE_CONTEXT_LIMITS>;
};

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalContext(value: unknown): string {
  function normalize(v: unknown): unknown {
    if (Array.isArray(v)) {
      return v.map(normalize);
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => compareStrings(a, b))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return v;
  }
  return JSON.stringify(normalize(value));
}

export function intelligenceContextHash(context: IntelligenceContext): string {
  return `sha256:${createHash('sha256').update(canonicalContext(context)).digest('hex')}`;
}

const CONFIDENCE_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildIntelligenceContext(input: BuildIntelligenceContextInput): IntelligenceContext {
  const limits = { ...DEFAULT_INTELLIGENCE_CONTEXT_LIMITS, ...input.limits };
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const analysisObjective = input.analysisObjective ?? 'general_overview';

  const brand: ContextSubject = {
    id: input.comparison.brandId,
    domain: input.comparison.ownedSubject.domain,
  };

  const competitors: ContextSubject[] = [...input.comparison.competitors]
    .map((c) => ({
      id: c.subjectId,
      domain: c.domain,
    }))
    .sort((a, b) => compareStrings(a.id, b.id))
    .slice(0, limits.maxCompetitors);

  const competitorIdSet = new Set(competitors.map((c) => c.id));

  // Build facts with first-class provenance
  const facts: ContextComparisonFact[] = [];
  for (const competitor of competitors) {
    for (const fact of input.comparison.facts) {
      const ownedValue = fact.valuesBySubjectId[brand.id];
      const competitorValue = fact.valuesBySubjectId[competitor.id];

      const numericDelta = fact.numericDeltas?.find(
        (delta) => delta.competitorSubjectId === competitor.id,
      );

      facts.push({
        key: fact.key,
        epistemicClass: 'observed',
        owned: {
          subjectId: brand.id,
          subjectRole: 'owned',
          domain: brand.domain,
          state: ownedValue?.state ?? 'unknown',
          value: ownedValue?.value ?? null,
          provenance: ownedValue?.provenance ?? null,
        },
        competitor: {
          subjectId: competitor.id,
          subjectRole: 'competitor',
          domain: competitor.domain,
          state: competitorValue?.state ?? 'unknown',
          value: competitorValue?.value ?? null,
          provenance: competitorValue?.provenance ?? null,
        },
        ...(numericDelta ? { delta: numericDelta } : {}),
      });
    }
  }

  // Deterministically sort facts by competitorId, then key
  const sortedFacts = facts
    .sort((a, b) => compareStrings(a.competitor.subjectId, b.competitor.subjectId) || compareStrings(a.key, b.key))
    .slice(0, limits.maxFacts);

  // Map known source URLs from comparison facts for evidence enrichment
  const sourceUrlBySourceId = new Map<string, string>();
  for (const fact of sortedFacts) {
    if (fact.owned.provenance) {
      sourceUrlBySourceId.set(fact.owned.provenance.sourceId, fact.owned.provenance.sourceUrl);
    }
    if (fact.competitor.provenance) {
      sourceUrlBySourceId.set(fact.competitor.provenance.sourceId, fact.competitor.provenance.sourceUrl);
    }
  }

  // Deduplicate and filter signals
  const seenSignalIds = new Set<string>();
  const scopedSignals = input.signals.filter((signal) => {
    if (signal.ownedBrandId !== brand.id || !competitorIdSet.has(signal.competitorId)) {
      return false;
    }
    if (seenSignalIds.has(signal.id)) {
      return false;
    }
    seenSignalIds.add(signal.id);
    return true;
  });

  // Sort signals deterministically: confidence (high -> medium -> low), then competitorId, then comparisonKey, then id
  const sortedSignals: ContextSignal[] = scopedSignals
    .sort((a, b) => {
      const confDiff = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
      if (confDiff !== 0) return confDiff;
      const compDiff = compareStrings(a.competitorId, b.competitorId);
      if (compDiff !== 0) return compDiff;
      const keyDiff = compareStrings(a.comparisonKey, b.comparisonKey);
      if (keyDiff !== 0) return keyDiff;
      return compareStrings(a.id, b.id);
    })
    .slice(0, limits.maxSignals)
    .map((signal) => {
      const evidence: ContextSignalEvidenceReference[] = signal.evidence.map((ref) => {
        const sourceUrl = sourceUrlBySourceId.get(ref.sourceId);
        return {
          role: ref.role,
          sourceId: ref.sourceId,
          snapshotId: ref.snapshotId,
          observationId: ref.observationId,
          confidence: ref.confidence,
          ...(ref.priorSnapshotId ? { priorSnapshotId: ref.priorSnapshotId } : {}),
          ...(ref.priorObservationId ? { priorObservationId: ref.priorObservationId } : {}),
          ...(ref.observedChangeId ? { observedChangeId: ref.observedChangeId } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
        };
      });

      return {
        id: signal.id,
        signalType: signal.signalType,
        comparisonKey: signal.comparisonKey,
        competitorId: signal.competitorId,
        ...(signal.direction ? { direction: signal.direction } : {}),
        statement: signal.statement,
        supportingValues: signal.supportingValues,
        confidence: signal.confidence,
        epistemicClass: 'derived',
        evidence,
      };
    });

  // Deduplicate and filter recent changes
  const rawChanges = input.observedChanges ?? [];
  const seenChangeIds = new Set<string>();
  const scopedChanges = rawChanges
    .map((item) => ('change' in item ? item.change : item))
    .filter((change) => {
      if (change.subjectId !== brand.id && !competitorIdSet.has(change.subjectId)) {
        return false;
      }
      if (seenChangeIds.has(change.id)) {
        return false;
      }
      seenChangeIds.add(change.id);
      return true;
    });

  const sortedChanges: ContextObservedChange[] = scopedChanges
    .sort((a, b) => compareStrings(b.detectedAt, a.detectedAt) || compareStrings(a.id, b.id))
    .slice(0, limits.maxRecentChanges)
    .map((change) => {
      const sourceUrl = sourceUrlBySourceId.get(change.sourceId);
      return {
        id: change.id,
        subjectId: change.subjectId,
        subjectRole: change.subjectId === brand.id ? 'owned' : 'competitor',
        factType: change.factType,
        changeType: change.changeType,
        detectedAt: change.detectedAt,
        beforeValue: change.beforeValue,
        afterValue: change.afterValue,
        epistemicClass: 'derived',
        evidence: {
          sourceId: change.sourceId,
          currentSnapshotId: change.currentSnapshotId,
          previousSnapshotId: change.previousSnapshotId,
          currentObservationId: change.currentObservationId,
          previousObservationId: change.previousObservationId,
          ...(sourceUrl ? { sourceUrl } : {}),
        },
      };
    });

  // Handle untrusted snippets: excluded by default unless includeSnippets is explicitly true
  let untrustedSnippets: ContextUntrustedSnippet[] = [];
  if (input.includeSnippets && input.untrustedSnippets && input.untrustedSnippets.length > 0) {
    const seenSnippetIds = new Set<string>();
    untrustedSnippets = input.untrustedSnippets
      .filter((snippet) => {
        if (snippet.subjectId !== brand.id && !competitorIdSet.has(snippet.subjectId)) {
          return false;
        }
        if (seenSnippetIds.has(snippet.snippetId)) {
          return false;
        }
        seenSnippetIds.add(snippet.snippetId);
        return true;
      })
      .sort((a, b) => compareStrings(a.snippetId, b.snippetId))
      .slice(0, limits.maxUntrustedSnippets)
      .map((snippet) => ({
        ...snippet,
        text: snippet.text.slice(0, 500),
      }));
  }

  const contextCandidate: IntelligenceContext = {
    contextVersion: 'intelligence-context-v1',
    brand,
    competitors,
    facts: sortedFacts,
    signals: sortedSignals,
    recentChanges: sortedChanges,
    untrustedSnippets,
    analysisObjective,
    generatedAt,
    limits,
  };

  const parsedContext = intelligenceContextSchema.parse(contextCandidate);

  const serialized = canonicalContext(parsedContext);
  if (serialized.length > limits.maxSerializedBytes) {
    throw new Error(
      `IntelligenceContext exceeds maximum serialized byte limit: ${serialized.length} > ${limits.maxSerializedBytes}`,
    );
  }

  return parsedContext;
}
