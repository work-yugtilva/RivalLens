import { describe, expect, it } from 'vitest';
import {
  buildBrandComparison,
  parseBrandComparisonRequest,
  type SubjectSourceEvidence,
} from '../../packages/domain/src/comparison';
import type { EvidenceObservation, SourceEvidence } from '../../packages/domain/src/current-state';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const OWNED_ID = BRAND_ID;
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_URL = 'https://brand.test/';

let observationCounter = 0;

function observation(
  factType: string,
  payload: Record<string, unknown>,
  observedAt = '2026-09-01T12:00:00.000Z',
  snapshotId = '44444444-4444-4444-8444-444444444444',
  sourceUrl = SOURCE_URL,
): EvidenceObservation {
  observationCounter += 1;
  return {
    id: `aaaaaaaa-bbbb-4ccc-8ddd-${String(observationCounter).padStart(12, '0')}`,
    factType,
    sourceUrl,
    payload,
    observedAt,
    confidence: 0.9,
    snapshotId,
  };
}

function source(sourceType: string, observations: EvidenceObservation[], sourceId = SOURCE_ID): SourceEvidence {
  return {
    sourceId,
    sourceType,
    snapshots: [{
      id: observations[0]?.snapshotId ?? '44444444-4444-4444-8444-444444444444',
      capturedAt: observations[0]?.observedAt ?? '2026-09-01T12:00:00.000Z',
      observations,
    }],
  };
}

function buildComparison(subjectsEvidence: SubjectSourceEvidence[]) {
  return buildBrandComparison({
    brandId: BRAND_ID,
    generatedAt: '2026-09-01T12:00:00.000Z',
    ownedSubject: { subjectType: 'brand', subjectId: OWNED_ID, domain: 'brand.test' },
    competitors: [{ subjectType: 'competitor', subjectId: COMPETITOR_ID, domain: 'rival.test' }],
    subjectsEvidence,
  });
}

function factKey(result: ReturnType<typeof buildComparison>, key: string) {
  return result.facts.find((fact) => fact.key === key);
}

describe('buildBrandComparison', () => {
  it('computes free-shipping threshold delta (owned 75 vs competitor 50)', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('pricing_offers', [observation('offer.free_shipping', { threshold: 75 })])],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [source('pricing_offers', [observation('offer.free_shipping', { threshold: 50 })])],
      },
    ]);

    const fact = factKey(result, 'offer.free_shipping_threshold');
    expect(fact?.numericDeltas).toEqual([{
      competitorSubjectId: COMPETITOR_ID,
      ownedValue: 75,
      competitorValue: 50,
      difference: -25,
      unit: 'usd',
    }]);
  });

  it('computes return-window delta (30 vs 60 days)', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('shipping_returns', [observation('policy.return_window', { duration: 30, unit: 'days' })])],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [source('shipping_returns', [observation('policy.return_window', { duration: 60, unit: 'days' })])],
      },
    ]);

    const fact = factKey(result, 'policy.return_window');
    expect(fact?.numericDeltas).toEqual([{
      competitorSubjectId: COMPETITOR_ID,
      ownedValue: 30,
      competitorValue: 60,
      difference: 30,
      unit: 'days',
    }]);
  });

  it('reports subscription presence and discount differences', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('subscription', [observation('subscription.details', { available: true, discountPercent: 10 })])],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [source('subscription', [observation('subscription.details', { available: false })])],
      },
    ]);

    const available = factKey(result, 'subscription.available');
    const discount = factKey(result, 'subscription.discount');
    expect(available?.valuesBySubjectId[OWNED_ID].state).toBe('present');
    expect(available?.valuesBySubjectId[COMPETITOR_ID].state).toBe('present');
    expect(available?.valuesBySubjectId[OWNED_ID].value).toEqual({ available: true });
    expect(available?.valuesBySubjectId[COMPETITOR_ID].value).toEqual({ available: false });
    expect(discount?.valuesBySubjectId[OWNED_ID].value).toEqual({ discountPercent: 10 });
    expect(discount?.valuesBySubjectId[COMPETITOR_ID].state).toBe('unknown');
  });

  it('returns normalized positioning text verbatim', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('homepage', [observation('positioning.homepage', { headline: '  Shop   Widgets ' })])],
      },
      { subjectId: COMPETITOR_ID, sources: [] },
    ]);

    const fact = factKey(result, 'positioning.homepage.headline');
    expect(fact?.valuesBySubjectId[OWNED_ID].value).toEqual({ headline: 'Shop Widgets' });
  });

  it('keeps unknown competitor state explicit', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('pricing_offers', [observation('offer.free_shipping', { threshold: 75 })])],
      },
      { subjectId: COMPETITOR_ID, sources: [] },
    ]);

    const fact = factKey(result, 'offer.free_shipping_threshold');
    expect(fact?.valuesBySubjectId[COMPETITOR_ID]).toEqual({
      state: 'unknown',
      value: null,
      provenance: null,
    });
  });

  it('does not compare unrelated product URLs across subjects', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [source('product', [
          observation('product.name', { name: 'Owned widget', canonicalUrl: 'https://brand.test/products/owned' }),
          observation('product.price', { currentPrice: 29, currency: 'USD' }),
        ])],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [source('product', [
          observation('product.name', { name: 'Rival widget', canonicalUrl: 'https://rival.test/products/rival' }),
          observation('product.price', { currentPrice: 19, currency: 'USD' }),
        ])],
      },
    ]);

    expect(result.facts.some((fact) => fact.key.includes('product'))).toBe(false);
    expect(result.productsBySubject[OWNED_ID].productCount).toBe(1);
    expect(result.productsBySubject[COMPETITOR_ID].productCount).toBe(1);
  });

  it('retains provenance on present values', () => {
    const observed = observation('offer.free_shipping', { threshold: 75 });
    const result = buildComparison([
      { subjectId: OWNED_ID, sources: [source('pricing_offers', [observed])] },
      { subjectId: COMPETITOR_ID, sources: [] },
    ]);

    const value = factKey(result, 'offer.free_shipping_threshold')?.valuesBySubjectId[OWNED_ID];
    expect(value?.provenance).toMatchObject({
      observationId: observed.id,
      snapshotId: observed.snapshotId,
      sourceId: SOURCE_ID,
      sourceUrl: SOURCE_URL,
      observedAt: observed.observedAt,
      confidence: observed.confidence,
    });
  });

  it('selects authoritative positioning from configured primary domain over localized subdomain', () => {
    const primaryObs: EvidenceObservation = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
      factType: 'positioning.homepage',
      sourceUrl: 'https://brand.test/',
      payload: { headline: 'Primary Global Headline' },
      observedAt: '2026-09-01T10:00:00.000Z',
      confidence: 0.9,
      snapshotId: 'snap-p1',
    };
    const localizedObs: EvidenceObservation = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222',
      factType: 'positioning.homepage',
      sourceUrl: 'https://uk.brand.test/',
      payload: { headline: 'UK Local Headline' },
      observedAt: '2026-09-01T12:00:00.000Z',
      confidence: 0.9,
      snapshotId: 'snap-l2',
    };

    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          {
            sourceId: 'src-1',
            sourceType: 'homepage',
            snapshots: [{ id: 'snap-p1', capturedAt: '2026-09-01T10:00:00.000Z', observations: [primaryObs] }],
          },
          {
            sourceId: 'src-2',
            sourceType: 'homepage',
            snapshots: [{ id: 'snap-l2', capturedAt: '2026-09-01T12:00:00.000Z', observations: [localizedObs] }],
          },
        ],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [source('homepage', [observation('positioning.homepage', { headline: 'Rival Headline' })])],
      },
    ]);

    const headline = factKey(result, 'positioning.homepage.headline');
    expect(headline?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ headline: 'Primary Global Headline' });
    expect(headline?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://brand.test/');
  });

  it('normalizes discount comparison key to offer.discount:percentage and selects headline discount', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 10 }),
          ]),
        ],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 15 }),
            observation('offer.discount', { type: 'percentage', amount: 20 }),
          ]),
        ],
      },
    ]);

    expect(result.facts.some((f) => f.key.startsWith('offer.discount:percentage:'))).toBe(false);
    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.state).toBe('present');
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 10 });
    expect(fact?.valuesBySubjectId[COMPETITOR_ID]?.state).toBe('present');
    expect(fact?.valuesBySubjectId[COMPETITOR_ID]?.value).toEqual({ type: 'percentage', amount: 20 });
    expect(fact?.numericDeltas).toEqual([{
      competitorSubjectId: COMPETITOR_ID,
      ownedValue: 10,
      competitorValue: 20,
      difference: 10,
      unit: 'percent',
    }]);
  });

  it('prefers exact configured host discount over higher localized subdomain discount (geo-aware discount authority)', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 39 }, '2026-09-01T12:00:00.000Z', 'snap-1', 'https://brand.test/pages/sale'),
          ], 'source-exact'),
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 42 }, '2026-09-01T12:00:00.000Z', 'snap-2', 'https://au.brand.test/pages/sale'),
          ], 'source-subdomain'),
        ],
      },
    ]);

    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 39 });
    expect(fact?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://brand.test/pages/sale');
  });

  it('prefers equivalent apex/www host discount over higher localized subdomain discount', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 35 }, '2026-09-01T12:00:00.000Z', 'snap-1', 'https://www.brand.test/pages/sale'),
          ], 'source-www'),
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 42 }, '2026-09-01T12:00:00.000Z', 'snap-2', 'https://au.brand.test/pages/sale'),
          ], 'source-subdomain'),
        ],
      },
    ]);

    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 35 });
    expect(fact?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://www.brand.test/pages/sale');
  });

  it('falls back to localized subdomain discount when configured host has no discount', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 42 }, '2026-09-01T12:00:00.000Z', 'snap-1', 'https://au.brand.test/pages/sale'),
          ], 'source-subdomain'),
        ],
      },
    ]);

    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 42 });
    expect(fact?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://au.brand.test/pages/sale');
  });

  it('selects maximum discount when observations share the same host authority tier', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('homepage', [
            observation('offer.discount', { type: 'percentage', amount: 25 }, '2026-09-01T12:00:00.000Z', 'snap-1', 'https://brand.test/'),
          ], 'source-home'),
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 39 }, '2026-09-01T12:00:00.000Z', 'snap-2', 'https://brand.test/pages/sale'),
          ], 'source-sale'),
        ],
      },
    ]);

    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 39 });
    expect(fact?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://brand.test/pages/sale');
  });

  it('applies host authority tiers to competitors and tracks exact provenance in comparison deltas', () => {
    const result = buildComparison([
      {
        subjectId: OWNED_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 39 }, '2026-09-01T12:00:00.000Z', 'snap-1', 'https://brand.test/sale'),
          ], 'owned-primary'),
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 42 }, '2026-09-01T12:00:00.000Z', 'snap-2', 'https://au.brand.test/sale'),
          ], 'owned-subdomain'),
        ],
      },
      {
        subjectId: COMPETITOR_ID,
        sources: [
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 30 }, '2026-09-01T12:00:00.000Z', 'snap-3', 'https://rival.test/offers'),
          ], 'comp-primary'),
          source('pricing_offers', [
            observation('offer.discount', { type: 'percentage', amount: 50 }, '2026-09-01T12:00:00.000Z', 'snap-4', 'https://au.rival.test/offers'),
          ], 'comp-subdomain'),
        ],
      },
    ]);

    const fact = factKey(result, 'offer.discount:percentage');
    expect(fact).toBeDefined();
    expect(fact?.valuesBySubjectId[OWNED_ID]?.value).toEqual({ type: 'percentage', amount: 39 });
    expect(fact?.valuesBySubjectId[OWNED_ID]?.provenance?.sourceUrl).toBe('https://brand.test/sale');
    expect(fact?.valuesBySubjectId[COMPETITOR_ID]?.value).toEqual({ type: 'percentage', amount: 30 });
    expect(fact?.valuesBySubjectId[COMPETITOR_ID]?.provenance?.sourceUrl).toBe('https://rival.test/offers');
    expect(fact?.numericDeltas).toEqual([{
      competitorSubjectId: COMPETITOR_ID,
      ownedValue: 39,
      competitorValue: 30,
      difference: -9,
      unit: 'percent',
    }]);
  });
});


describe('parseBrandComparisonRequest', () => {
  it('dedupes competitor ids and enforces max 5', () => {
    const parsed = parseBrandComparisonRequest({
      competitorIds: [
        COMPETITOR_ID,
        COMPETITOR_ID,
        '33333333-3333-4333-8333-333333333333',
      ],
    });
    expect(parsed.competitorIds).toEqual([COMPETITOR_ID, '33333333-3333-4333-8333-333333333333']);

    expect(() => parseBrandComparisonRequest({
      competitorIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
      ],
    })).toThrow();
  });
});
