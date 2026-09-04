import { describe, expect, it } from 'vitest';
import type {
  BrandComparisonResult,
  ComparisonSubjectValue,
  CompetitiveSignalCandidate,
} from '../../packages/schemas/src';
import {
  COMPETITIVE_SIGNAL_RULE_VERSION,
  currentCompetitiveSignalFamily,
  detectCompetitiveSignals,
  resolveCurrentCompetitiveSignals,
} from '../../packages/intelligence/src';

const OWNED_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const OWNED_SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const COMPETITOR_SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const GENERATED_AT = '2026-09-04T12:00:00.000Z';

function value(
  state: ComparisonSubjectValue['state'],
  data: Record<string, unknown> | null,
  role: 'owned' | 'competitor',
  revision = '1',
): ComparisonSubjectValue {
  const sourceId = role === 'owned' ? OWNED_SOURCE_ID : COMPETITOR_SOURCE_ID;
  const suffix = `${role === 'owned' ? 'a' : 'b'}${revision.padStart(11, '0')}`;
  const evidenceId = `00000000-0000-4000-8000-${suffix}`;
  return {
    state,
    value: data,
    provenance:
      state === 'unknown'
        ? null
        : {
            observationId:
              state === 'explicitly_absent'
                ? null
                : evidenceId,
            snapshotId: evidenceId,
            sourceId,
            sourceUrl: `https://${role}.test/`,
            observedAt: GENERATED_AT,
            confidence: 0.95,
          },
  };
}

function comparison(facts: BrandComparisonResult['facts']): BrandComparisonResult {
  return {
    brandId: OWNED_ID,
    generatedAt: GENERATED_AT,
    ownedSubject: { subjectType: 'brand', subjectId: OWNED_ID, domain: 'owned.test' },
    competitors: [{ subjectType: 'competitor', subjectId: COMPETITOR_ID, domain: 'rival.test' }],
    facts,
    productsBySubject: {
      [OWNED_ID]: { productCount: 0, products: [] },
      [COMPETITOR_ID]: { productCount: 0, products: [] },
    },
  };
}

function shipping(
  owned: number | null,
  competitor: number | null,
  revision = '1',
): BrandComparisonResult {
  const ownedValue = owned === null ? value('unknown', null, 'owned', revision) : value('present', { threshold: owned }, 'owned', revision);
  const competitorValue = competitor === null ? value('unknown', null, 'competitor', revision) : value('present', { threshold: competitor }, 'competitor', revision);
  return comparison([
    {
      key: 'offer.free_shipping_threshold',
      valuesBySubjectId: { [OWNED_ID]: ownedValue, [COMPETITOR_ID]: competitorValue },
      ...(owned === null || competitor === null
        ? {}
        : {
            numericDeltas: [{
              competitorSubjectId: COMPETITOR_ID,
              ownedValue: owned,
              competitorValue: competitor,
              difference: competitor - owned,
              unit: 'usd' as const,
            }],
          }),
    },
  ]);
}

function historical(comparisonResult: BrandComparisonResult): CompetitiveSignalCandidate[] {
  return detectCompetitiveSignals({ comparison: comparisonResult, observedChanges: [], generatedAt: GENERATED_AT });
}

function resolve(
  comparisonResult: BrandComparisonResult,
  historicalSignals: CompetitiveSignalCandidate[],
) {
  return resolveCurrentCompetitiveSignals({
    comparison: comparisonResult,
    historicalSignals,
    generatedAt: GENERATED_AT,
  });
}

describe('resolveCurrentCompetitiveSignals', () => {
  it('supersedes lower and higher shipping conditions without changing historical signals', () => {
    const lowerHistory = historical(shipping(75, 50));
    const projection = resolve(shipping(75, 100, '2'), lowerHistory);

    expect(lowerHistory).toHaveLength(1);
    expect(lowerHistory[0]?.signalType).toBe('competitor_lower_free_shipping_threshold');
    expect(projection.signals).toMatchObject([
      { signalType: 'competitor_higher_free_shipping_threshold', supportingValues: { owned: 75, competitor: 100 } },
    ]);
    expect(projection.signals[0]?.evidence.map((entry) => entry.snapshotId)).not.toEqual(
      lowerHistory[0]?.evidence.map((entry) => entry.snapshotId),
    );
    expect(projection.unresolved).toEqual([]);
  });

  it('supersedes a historical higher shipping condition with the later lower condition', () => {
    const higherHistory = historical(shipping(75, 100));

    expect(resolve(shipping(75, 50, '2'), higherHistory).signals).toMatchObject([
      { signalType: 'competitor_lower_free_shipping_threshold' },
    ]);
    expect(higherHistory[0]?.signalType).toBe('competitor_higher_free_shipping_threshold');
  });

  it('resolves equality to no current shipping signal and restores the current signal when the difference returns', () => {
    const lowerHistory = historical(shipping(75, 50));
    expect(resolve(shipping(75, 75, '2'), lowerHistory)).toMatchObject({ signals: [], unresolved: [] });
    expect(resolve(shipping(75, 50, '3'), lowerHistory).signals).toMatchObject([
      { signalType: 'competitor_lower_free_shipping_threshold' },
    ]);
  });

  it('clears a subscription presence difference after both sides explicitly offer it', () => {
    const prior = comparison([
      {
        key: 'subscription.available',
        valuesBySubjectId: {
          [OWNED_ID]: value('explicitly_absent', null, 'owned'),
          [COMPETITOR_ID]: value('present', { available: true }, 'competitor'),
        },
      },
    ]);
    const current = comparison([
      {
        key: 'subscription.available',
        valuesBySubjectId: {
          [OWNED_ID]: value('present', { available: true }, 'owned', '2'),
          [COMPETITOR_ID]: value('present', { available: true }, 'competitor', '2'),
        },
      },
    ]);

    expect(resolve(current, historical(prior))).toMatchObject({ signals: [], unresolved: [] });
  });

  it('reports unknown rather than inventing a shipping reversal or confirmed disappearance', () => {
    const lowerHistory = historical(shipping(75, 50));
    const projection = resolve(shipping(75, null, '2'), lowerHistory);

    expect(projection.signals).toEqual([]);
    expect(projection.unresolved).toEqual([
      {
        logicalIdentity: {
          ownedBrandId: OWNED_ID,
          competitorId: COMPETITOR_ID,
          comparisonKey: 'offer.free_shipping_threshold',
          signalFamily: 'relative_numeric',
        },
        state: 'unknown',
      },
    ]);
  });

  it('resolves normalized headline equality and later difference from current evidence', () => {
    const headline = (owned: string, competitor: string, revision = '1') =>
      comparison([
        {
          key: 'positioning.homepage.headline',
          valuesBySubjectId: {
            [OWNED_ID]: value('present', { headline: owned }, 'owned', revision),
            [COMPETITOR_ID]: value('present', { headline: competitor }, 'competitor', revision),
          },
        },
      ]);
    const prior = historical(headline('Own headline', 'Rival headline'));

    expect(resolve(headline('Same headline', 'Same headline', '2'), prior)).toMatchObject({ signals: [], unresolved: [] });
    expect(resolve(headline('Own headline', 'New rival headline', '3'), prior).signals).toMatchObject([
      { signalType: 'positioning_differs', comparisonKey: 'positioning.homepage.headline' },
    ]);
  });

  it('uses only the latest supported rule version for unresolved current state and excludes change events', () => {
    const lowerHistory = historical(shipping(75, 50));
    const oldVersion = lowerHistory.map((signal) => ({ ...signal, ruleVersion: 'competitive-signals-v0' }));

    expect(resolve(shipping(75, null, '2'), oldVersion).unresolved).toEqual([]);
    expect(currentCompetitiveSignalFamily('competitor_lowered_free_shipping_threshold')).toBeNull();
    expect(resolve(shipping(75, 50, '2'), lowerHistory).signals).toMatchObject([
      { signalType: 'competitor_lower_free_shipping_threshold', ruleVersion: COMPETITIVE_SIGNAL_RULE_VERSION },
    ]);
  });
});
