import {
  buildIntelligenceContext,
  generateStrategicHypotheses,
  resolveCurrentCompetitiveSignals,
} from '@rivallens/intelligence';
import {
  strategicHypothesisSchema,
  type AnalysisObjective,
  type BrandComparisonResult,
  type CompetitiveSignal,
  type ComparisonProvenance,
  type ComparisonSubjectValue,
  type ContextUntrustedSnippet,
  type IntelligenceContext,
  type ObservedChange,
  type StrategicHypothesis,
} from '@rivallens/schemas';

// Deterministic synthetic identities for the evaluation suite. No real companies.
export const EVAL_BRAND_ID = '11111111-1111-4111-8111-111111111111';
export const EVAL_COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
export const EVAL_COMPETITOR_2_ID = '33333333-3333-4333-8333-333333333333';
export const EVAL_GENERATED_AT = '2026-09-04T12:00:00.000Z';

export const evalUuid = (index: number): string =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

type SubjectData = Record<string, unknown> | false | null;

export type EvalFactDefinition = {
  readonly key: string;
  readonly owned: SubjectData;
  readonly competitor: SubjectData;
  readonly competitor2?: SubjectData;
  readonly numeric?: { readonly field: string; readonly unit: 'usd' | 'days' | 'percent' };
};

function provenanceFor(roleSeed: number, index: number): ComparisonProvenance {
  return {
    sourceId: evalUuid(900 + roleSeed),
    snapshotId: evalUuid(910 + roleSeed),
    observationId: evalUuid(1000 + index * 3 + roleSeed),
    sourceUrl: `https://synthetic-${roleSeed}.test/`,
    observedAt: EVAL_GENERATED_AT,
    confidence: 0.95,
  };
}

// `null`  -> state 'unknown'          (data not collected; NOT evidence of absence)
// `false` -> state 'explicitly_absent' (confirmed absent; carries provenance)
// object  -> state 'present'
function subjectValue(data: SubjectData, roleSeed: number, index: number): ComparisonSubjectValue {
  if (data === null) return { state: 'unknown', value: null, provenance: null };
  if (data === false) {
    return { state: 'explicitly_absent', value: null, provenance: provenanceFor(roleSeed, index) };
  }
  return { state: 'present', value: data, provenance: provenanceFor(roleSeed, index) };
}

export function buildEvalComparison(
  definitions: readonly EvalFactDefinition[],
  options: { readonly competitors?: 1 | 2 } = {},
): BrandComparisonResult {
  const competitorCount = options.competitors ?? 1;
  const competitors = [
    { subjectType: 'competitor' as const, subjectId: EVAL_COMPETITOR_ID, domain: 'rival.test' },
    ...(competitorCount === 2
      ? [{ subjectType: 'competitor' as const, subjectId: EVAL_COMPETITOR_2_ID, domain: 'rival2.test' }]
      : []),
  ];

  return {
    brandId: EVAL_BRAND_ID,
    generatedAt: EVAL_GENERATED_AT,
    ownedSubject: { subjectType: 'brand', subjectId: EVAL_BRAND_ID, domain: 'owned.test' },
    competitors,
    productsBySubject: {},
    facts: definitions.map((definition, index) => {
      const values: BrandComparisonResult['facts'][number]['valuesBySubjectId'] = {
        [EVAL_BRAND_ID]: subjectValue(definition.owned, 0, index),
        [EVAL_COMPETITOR_ID]: subjectValue(definition.competitor, 1, index),
      };
      if (competitorCount === 2) {
        values[EVAL_COMPETITOR_2_ID] = subjectValue(
          definition.competitor2 ?? definition.competitor,
          2,
          index,
        );
      }

      const deltas: BrandComparisonResult['facts'][number]['numericDeltas'] = [];
      const { numeric } = definition;
      if (numeric && definition.owned && definition.competitor) {
        const ownedValue = Number((definition.owned as Record<string, unknown>)[numeric.field]);
        const competitorValue = Number(
          (definition.competitor as Record<string, unknown>)[numeric.field],
        );
        deltas.push({
          competitorSubjectId: EVAL_COMPETITOR_ID,
          ownedValue,
          competitorValue,
          difference: competitorValue - ownedValue,
          unit: numeric.unit,
        });
      }
      if (
        competitorCount === 2 &&
        numeric &&
        definition.owned &&
        (definition.competitor2 ?? definition.competitor)
      ) {
        const target = (definition.competitor2 ?? definition.competitor) as Record<string, unknown>;
        const ownedValue = Number((definition.owned as Record<string, unknown>)[numeric.field]);
        const competitorValue = Number(target[numeric.field]);
        deltas.push({
          competitorSubjectId: EVAL_COMPETITOR_2_ID,
          ownedValue,
          competitorValue,
          difference: competitorValue - ownedValue,
          unit: numeric.unit,
        });
      }

      return {
        key: definition.key,
        valuesBySubjectId: values,
        ...(deltas.length > 0 ? { numericDeltas: deltas } : {}),
      };
    }),
  };
}

export function resolveEvalSignals(comparison: BrandComparisonResult): CompetitiveSignal[] {
  return resolveCurrentCompetitiveSignals({
    comparison,
    historicalSignals: [],
    generatedAt: EVAL_GENERATED_AT,
  }).signals.map((candidate, index) => ({ ...candidate, id: evalUuid(index + 1) }));
}

export function buildFallbackHypotheses(signals: readonly CompetitiveSignal[]): StrategicHypothesis[] {
  return generateStrategicHypotheses({
    currentSignals: [...signals],
    generatedAt: EVAL_GENERATED_AT,
  }).map((candidate, index) =>
    strategicHypothesisSchema.parse({ ...candidate, id: evalUuid(700 + index) }),
  );
}

export type BuildEvalContextInput = {
  readonly facts: readonly EvalFactDefinition[];
  readonly competitors?: 1 | 2;
  readonly observedChanges?: ReadonlyArray<ObservedChange>;
  readonly untrustedSnippets?: ReadonlyArray<ContextUntrustedSnippet>;
  readonly includeSnippets?: boolean;
  readonly analysisObjective?: AnalysisObjective;
};

export type BuiltEvalContext = {
  readonly context: IntelligenceContext;
  readonly signals: CompetitiveSignal[];
};

export function buildEvalContext(input: BuildEvalContextInput): BuiltEvalContext {
  const comparison = buildEvalComparison(input.facts, { competitors: input.competitors ?? 1 });
  const signals = resolveEvalSignals(comparison);
  const context = buildIntelligenceContext({
    comparison,
    signals,
    ...(input.observedChanges ? { observedChanges: [...input.observedChanges] } : {}),
    ...(input.untrustedSnippets ? { untrustedSnippets: [...input.untrustedSnippets] } : {}),
    ...(input.includeSnippets !== undefined ? { includeSnippets: input.includeSnippets } : {}),
    ...(input.analysisObjective ? { analysisObjective: input.analysisObjective } : {}),
    generatedAt: EVAL_GENERATED_AT,
  });
  return { context, signals };
}
