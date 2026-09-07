import { resolveCurrentCompetitiveSignals } from '../../../packages/intelligence/src';
import type {
  BrandComparisonResult,
  ComparisonSubjectValue,
  CompetitiveReportInput,
} from '../../../packages/schemas/src';
import {
  BRAND_ID,
  COMPETITOR_ID,
  GENERATED_AT,
  uuid,
  hypotheses,
  experiments,
} from './current-experiments';

export { BRAND_ID, COMPETITOR_ID, GENERATED_AT, uuid };

export function reportInput(
  definitions: Array<{
    key: string;
    owned: Record<string, unknown> | false | null;
    competitor: Record<string, unknown> | false | null;
    numeric?: { field: string; unit: 'usd' | 'days' | 'percent' };
  }> = [
    {
      key: 'offer.free_shipping_threshold',
      owned: { threshold: 75 },
      competitor: { threshold: 50 },
      numeric: { field: 'threshold', unit: 'usd' },
    },
  ],
): CompetitiveReportInput {
  const comparison: BrandComparisonResult = {
    brandId: BRAND_ID,
    generatedAt: GENERATED_AT,
    ownedSubject: { subjectType: 'brand', subjectId: BRAND_ID, domain: 'owned.test' },
    competitors: [{ subjectType: 'competitor', subjectId: COMPETITOR_ID, domain: 'rival.test' }],
    productsBySubject: {},
    facts: definitions.map((definition, index) => {
      const value = (data: typeof definition.owned, role: number): ComparisonSubjectValue => ({
        state: data === null ? 'unknown' : data === false ? 'explicitly_absent' : 'present',
        value: data === false ? null : data,
        provenance:
          data === null
            ? null
            : {
                sourceId: uuid(900 + role),
                snapshotId: uuid(910 + role),
                observationId: data === false ? null : uuid(1000 + index * 2 + role),
                sourceUrl: `https://${role === 0 ? 'owned' : 'rival'}.test/`,
                observedAt: GENERATED_AT,
                confidence: 0.95,
              },
      });
      const owned = definition.owned,
        competitor = definition.competitor,
        numeric = definition.numeric;
      return {
        key: definition.key,
        valuesBySubjectId: { [BRAND_ID]: value(owned, 0), [COMPETITOR_ID]: value(competitor, 1) },
        ...(numeric && owned && competitor
          ? {
              numericDeltas: [
                {
                  competitorSubjectId: COMPETITOR_ID,
                  ownedValue: Number(owned[numeric.field]),
                  competitorValue: Number(competitor[numeric.field]),
                  difference: Number(competitor[numeric.field]) - Number(owned[numeric.field]),
                  unit: numeric.unit,
                },
              ],
            }
          : {}),
      };
    }),
  };
  const signalProjection = resolveCurrentCompetitiveSignals({
    comparison,
    historicalSignals: [],
    generatedAt: GENERATED_AT,
  });
  const currentSignals = signalProjection.signals.map((candidate, index) => ({
    ...candidate,
    id: uuid(index + 1),
  }));
  const currentHypotheses = hypotheses(currentSignals);
  return {
    comparison,
    signalProjection,
    currentSignals,
    hypothesisProjection: {
      hypothesisEngineVersion: 'strategic-hypotheses-v1',
      hypotheses: currentHypotheses,
      unresolved: [],
      generationNeeded: [],
    },
    experimentProjection: {
      experimentEngineVersion: 'recommended-experiments-v1' as const,
      experiments: experiments(currentSignals, currentHypotheses),
      unresolved: [],
      generationNeeded: [],
    },
    generatedAt: GENERATED_AT,
  };
}
