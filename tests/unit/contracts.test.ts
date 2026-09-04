import { describe, expect, it } from 'vitest';
import { DETECTOR_VERSION } from '../../packages/domain/src/observed-changes';
import {
  observationSchema,
  observationCandidateSchema,
  competitiveSignalCandidateSchema,
  competitiveSignalSchema,
  observedChangeCandidateSchema,
  observedChangeSchema,
  rawSnapshotSchema,
  reportSchema,
  snapshotSchema,
} from '../../packages/schemas/src';

const id = '5a7b618a-fd34-4d62-a3d2-d2bf6f867170';
const timestamp = '2026-09-01T12:00:00.000Z';

describe('evidence contracts', () => {
  it('requires snapshot provenance', () => {
    expect(
      snapshotSchema.parse({
        id,
        sourceId: id,
        capturedAt: timestamp,
        contentHash: 'sha256:example',
      }),
    ).toMatchObject({ sourceId: id, capturedAt: timestamp });
  });

  it('keeps connector output free of persistence IDs', () => {
    const rawSnapshot = rawSnapshotSchema.parse({
      connectorType: 'website',
      sourceType: 'homepage',
      canonicalUrl: 'https://example.com/',
      capturedAt: timestamp,
      content: { html: '<h1>Example</h1>' },
    });
    const candidate = observationCandidateSchema.parse({
      factType: 'positioning',
      observedAt: timestamp,
      sourceUrl: rawSnapshot.canonicalUrl,
      payload: { headline: 'Example' },
      extractionMethod: 'dom',
      confidence: 0.9,
      extractorVersion: 'v1',
    });

    expect(rawSnapshot).not.toHaveProperty('id');
    expect(candidate).not.toHaveProperty('snapshotId');
  });

  it('rejects observations without snapshot lineage', () => {
    expect(() =>
      observationSchema.parse({
        id,
        subjectId: id,
        factType: 'price_changed',
        observedAt: timestamp,
        payload: {},
        confidence: 0.9,
        extractorVersion: 'v1',
      }),
    ).toThrow();
  });

  it('requires snapshot lineage on observed changes', () => {
    expect(() =>
      observedChangeSchema.parse({
        factType: 'product.price',
        changeType: 'product.price.increased',
        previousObservationId: null,
        currentObservationId: id,
        factIdentity: 'product:https://example.com/:price:current',
        beforeValue: { currentPrice: 29 },
        afterValue: { currentPrice: 39 },
        detectedAt: timestamp,
      }),
    ).toThrow();

    expect(
      observedChangeSchema.parse({
        id,
        subjectId: id,
        sourceId: id,
        factType: 'product.price',
        changeType: 'product.price.increased',
        previousSnapshotId: id,
        currentSnapshotId: id,
        previousObservationId: null,
        currentObservationId: id,
        factIdentity: 'product:https://example.com/:price:current',
        beforeValue: { currentPrice: 29 },
        afterValue: { currentPrice: 39 },
        detectedAt: timestamp,
        detectorVersion: DETECTOR_VERSION,
        changeHash: `sha256:${'a'.repeat(64)}`,
      }),
    ).toMatchObject({
      subjectId: id,
      sourceId: id,
      currentSnapshotId: id,
      changeHash: `sha256:${'a'.repeat(64)}`,
      detectorVersion: DETECTOR_VERSION,
    });
  });

  it('accepts observed change candidates without persistence id', () => {
    const candidate = observedChangeCandidateSchema.parse({
      subjectId: id,
      sourceId: id,
      factType: 'product.price',
      changeType: 'product.price.increased',
      previousSnapshotId: id,
      currentSnapshotId: id,
      previousObservationId: null,
      currentObservationId: id,
      factIdentity: 'product:https://example.com/:price:current',
      beforeValue: { currentPrice: 29 },
      afterValue: { currentPrice: 39 },
      detectedAt: timestamp,
      detectorVersion: DETECTOR_VERSION,
      changeHash: `sha256:${'b'.repeat(64)}`,
    });

    expect(candidate).not.toHaveProperty('id');
  });

  it('strictly validates competitive signal candidates and persisted signals', () => {
    const candidate = {
      signalType: 'competitor_lower_free_shipping_threshold',
      ownedBrandId: id,
      competitorId: '22222222-2222-4222-8222-222222222222',
      comparisonKey: 'offer.free_shipping_threshold',
      statement: "rival.test's free-shipping threshold is $25 lower than the owned brand's.",
      supportingValues: { owned: 75, competitor: 50, delta: -25, unit: 'usd' },
      confidence: 'medium',
      evidence: [
        {
          role: 'owned',
          sourceId: id,
          snapshotId: id,
          observationId: id,
          confidence: 0.8,
        },
        {
          role: 'competitor',
          sourceId: id,
          snapshotId: id,
          observationId: id,
          confidence: 0.9,
        },
      ],
      generatedAt: timestamp,
      ruleVersion: 'competitive-signals-v1',
      signalHash: `sha256:${'a'.repeat(64)}`,
      direction: 'competitor_lower',
    } as const;

    expect(competitiveSignalCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(competitiveSignalSchema.parse({ id, ...candidate })).toMatchObject({ id, ...candidate });
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, recommendation: 'Lower price' }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, hypothesis: 'May convert' }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, experiment: 'A/B test' }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, causalClaim: 'Causes growth' }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, aiProvenance: {} }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, signalType: 'offer_gap' }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({ ...candidate, competitorId: null }),
    ).toThrow();
    expect(() => competitiveSignalCandidateSchema.parse({ ...candidate, evidence: [] })).toThrow();
    const evidenceWithoutObservationId = Object.fromEntries(
      Object.entries(candidate.evidence[0]).filter(([key]) => key !== 'observationId'),
    );
    expect(() =>
      competitiveSignalCandidateSchema.parse({
        ...candidate,
        evidence: [evidenceWithoutObservationId],
      }),
    ).toThrow();
    for (const role of ['previous', 'current', 'evaluation'] as const) {
      expect(() =>
        competitiveSignalCandidateSchema.parse({
          ...candidate,
          evidence: [
            {
              ...candidate.evidence[1],
              role,
              observationId: role === 'evaluation' ? null : candidate.evidence[1].observationId,
            },
          ],
        }),
      ).toThrow();
    }
    expect(
      competitiveSignalCandidateSchema.parse({
        ...candidate,
        evidence: [
          {
            ...candidate.evidence[1],
            role: 'previous_evaluation',
            observedChangeId: id,
          },
        ],
      }).evidence[0],
    ).toMatchObject({
      role: 'previous_evaluation',
      observationId: id,
      observedChangeId: id,
    });
    expect(() =>
      competitiveSignalCandidateSchema.parse({
        ...candidate,
        evidence: [
          {
            ...candidate.evidence[1],
            role: 'previous_evaluation',
            observationId: null,
            observedChangeId: id,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      competitiveSignalCandidateSchema.parse({
        ...candidate,
        evidence: [{ ...candidate.evidence[1], role: 'previous_evaluation' }],
      }),
    ).toThrow();

    expect(() =>
      reportSchema.parse({
        id,
        brandId: id,
        revision: 1,
        generatedAt: timestamp,
        evidenceRevision: '1',
        advantages: [{ text: 'Claim', confidence: 0.7, evidenceIds: [] }],
        competitorAdvantages: [],
        workingPatterns: [],
        recommendedTests: [],
      }),
    ).toThrow();
  });
});
