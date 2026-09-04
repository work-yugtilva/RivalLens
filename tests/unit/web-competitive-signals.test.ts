import { describe, expect, it, vi } from 'vitest';
import type { BrandComparisonResult, ObservedChange } from '../../packages/schemas/src';
import type { SubjectSourceEvidence } from '../../packages/domain/src';
import {
  enrichObservedChanges,
  hydrateSignalRows,
  hydratePersistedSignals,
  intersectCurrentPersistedSignals,
} from '../../apps/web/src/lib/internal/competitive-signals';

vi.mock('server-only', () => ({}));

const brandComparison = await import('../../apps/web/src/lib/internal/brand-comparison');

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITOR_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const CURRENT_SNAPSHOT_ID = '55555555-5555-4555-8555-555555555555';
const PREVIOUS_OBSERVATION_ID = '66666666-6666-4666-8666-666666666666';
const CURRENT_OBSERVATION_ID = '77777777-7777-4777-8777-777777777777';
const CHANGE_ID = '88888888-8888-4888-8888-888888888888';
const TIMESTAMP = '2026-09-03T12:00:00.000Z';

function comparison(): BrandComparisonResult {
  return {
    brandId: BRAND_ID,
    generatedAt: TIMESTAMP,
    ownedSubject: { subjectType: 'brand', subjectId: BRAND_ID, domain: 'owned.test' },
    competitors: [{ subjectType: 'competitor', subjectId: COMPETITOR_ID, domain: 'rival.test' }],
    facts: [
      {
        key: 'offer.discount:percentage:10',
        valuesBySubjectId: {
          [BRAND_ID]: { state: 'unknown', value: null, provenance: null },
          [COMPETITOR_ID]: {
            state: 'explicitly_absent',
            value: null,
            provenance: {
              observationId: null,
              snapshotId: CURRENT_SNAPSHOT_ID,
              priorObservationId: PREVIOUS_OBSERVATION_ID,
              priorSnapshotId: PREVIOUS_SNAPSHOT_ID,
              sourceId: SOURCE_ID,
              sourceUrl: 'https://rival.test/',
              observedAt: TIMESTAMP,
              confidence: 0.8,
            },
          },
        },
      },
    ],
    productsBySubject: {
      [BRAND_ID]: { productCount: 0, products: [] },
      [COMPETITOR_ID]: { productCount: 0, products: [] },
    },
  };
}

function evidence(
  currentObservations = true,
  options: {
    priorObservations?: boolean;
    priorFactType?: string;
    priorConfidence?: number;
    sourceType?: string;
    currentFactType?: string;
  } = {},
): SubjectSourceEvidence[] {
  return [
    {
      subjectId: COMPETITOR_ID,
      sources: [
        {
          sourceId: SOURCE_ID,
          sourceType: options.sourceType ?? 'pricing_offers',
          snapshots: [
            {
              id: PREVIOUS_SNAPSHOT_ID,
              capturedAt: '2026-09-02T12:00:00.000Z',
              observations:
                options.priorObservations === false
                  ? []
                  : [
                      {
                        id: PREVIOUS_OBSERVATION_ID,
                        factType: options.priorFactType ?? 'offer.discount',
                        sourceUrl: 'https://rival.test/',
                        payload: { type: 'percentage', amount: 10 },
                        observedAt: '2026-09-02T12:00:00.000Z',
                        confidence: options.priorConfidence ?? 0.9,
                        snapshotId: PREVIOUS_SNAPSHOT_ID,
                      },
                    ],
            },
            {
              id: CURRENT_SNAPSHOT_ID,
              capturedAt: TIMESTAMP,
              observations: currentObservations
                ? [
                    {
                      id: CURRENT_OBSERVATION_ID,
                      factType: options.currentFactType ?? 'offer.free_shipping',
                      sourceUrl: 'https://rival.test/',
                      payload: { threshold: 50 },
                      observedAt: TIMESTAMP,
                      confidence: 0.8,
                      snapshotId: CURRENT_SNAPSHOT_ID,
                    },
                  ]
                : [],
            },
          ],
        },
      ],
    },
  ];
}

function change(): ObservedChange {
  return {
    id: CHANGE_ID,
    subjectId: COMPETITOR_ID,
    sourceId: SOURCE_ID,
    factType: 'offer.discount',
    changeType: 'offer.discount.removed',
    previousSnapshotId: PREVIOUS_SNAPSHOT_ID,
    currentSnapshotId: CURRENT_SNAPSHOT_ID,
    previousObservationId: PREVIOUS_OBSERVATION_ID,
    currentObservationId: null,
    factIdentity: 'offer:discount:percentage:10',
    beforeValue: { type: 'percentage', amount: 10 },
    afterValue: null,
    detectedAt: TIMESTAMP,
    detectorVersion: 'website-change-detector-v2',
    changeHash: `sha256:${'a'.repeat(64)}`,
  };
}

function promotionAddition(): ObservedChange {
  return {
    ...change(),
    factType: 'offer.promo',
    changeType: 'offer.promo.added',
    previousObservationId: null,
    currentObservationId: CURRENT_OBSERVATION_ID,
    factIdentity: 'offer:promo:SAVE10',
    beforeValue: null,
    afterValue: { code: 'SAVE10' },
  };
}

function subscriptionAddition(): ObservedChange {
  return {
    ...promotionAddition(),
    factType: 'subscription.details',
    changeType: 'subscription.added',
    factIdentity: 'subscription:details',
    afterValue: { available: true },
  };
}

describe('enrichObservedChanges', () => {
  it('uses coherent explicit-absence provenance for removal evaluation evidence', () => {
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(),
        observedChanges: [change()],
      }),
    ).toEqual([
      {
        change: change(),
        evidence: [
          {
            role: 'previous',
            sourceId: SOURCE_ID,
            snapshotId: PREVIOUS_SNAPSHOT_ID,
            observationId: PREVIOUS_OBSERVATION_ID,
            observedChangeId: CHANGE_ID,
            confidence: 0.9,
          },
          {
            role: 'evaluation',
            sourceId: SOURCE_ID,
            snapshotId: CURRENT_SNAPSHOT_ID,
            observationId: null,
            observedChangeId: CHANGE_ID,
            confidence: 0.8,
          },
        ],
      },
    ]);
  });

  it('does not treat an empty snapshot as removal evidence', () => {
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(false),
        observedChanges: [change()],
      }),
    ).toEqual([]);
  });

  it('adds deterministic prior-evaluation evidence for a promotion addition', () => {
    const addition = promotionAddition();
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(true, {
          priorFactType: 'offer.promo',
          priorConfidence: 0.37,
        }),
        observedChanges: [addition],
      }),
    ).toEqual([
      {
        change: addition,
        evidence: [
          {
            role: 'previous_evaluation',
            sourceId: SOURCE_ID,
            snapshotId: PREVIOUS_SNAPSHOT_ID,
            observationId: PREVIOUS_OBSERVATION_ID,
            observedChangeId: CHANGE_ID,
            confidence: 0.37,
          },
          {
            role: 'current',
            sourceId: SOURCE_ID,
            snapshotId: CURRENT_SNAPSHOT_ID,
            observationId: CURRENT_OBSERVATION_ID,
            observedChangeId: CHANGE_ID,
            confidence: 0.8,
          },
        ],
      },
    ]);
  });

  it('adds deterministic prior-evaluation evidence for a subscription addition', () => {
    const addition = subscriptionAddition();
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(true, {
          sourceType: 'subscription',
          priorFactType: 'subscription.details',
          currentFactType: 'subscription.details',
          priorConfidence: 0.61,
        }),
        observedChanges: [addition],
      }),
    ).toMatchObject([
      {
        change: addition,
        evidence: [
          {
            role: 'previous_evaluation',
            sourceId: SOURCE_ID,
            snapshotId: PREVIOUS_SNAPSHOT_ID,
            observationId: PREVIOUS_OBSERVATION_ID,
            observedChangeId: CHANGE_ID,
            confidence: 0.61,
          },
          {
            role: 'current',
            sourceId: SOURCE_ID,
            snapshotId: CURRENT_SNAPSHOT_ID,
            observationId: CURRENT_OBSERVATION_ID,
            observedChangeId: CHANGE_ID,
            confidence: 0.8,
          },
        ],
      },
    ]);
  });

  it.each([
    ['empty', { priorObservations: false }],
    ['non-covering', { sourceType: 'homepage', priorFactType: 'offer.discount' }],
  ])('suppresses a promotion addition with an %s prior snapshot', (_label, options) => {
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(true, options),
        observedChanges: [promotionAddition()],
      }),
    ).toEqual([]);
  });

  it('suppresses a change when the selected current snapshot is newer than its current snapshot', () => {
    const subjectsEvidence = evidence();
    const source = subjectsEvidence[0]!.sources[0]!;
    source.snapshots.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      capturedAt: '2026-09-04T12:00:00.000Z',
      observations: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          factType: 'offer.promo',
          sourceUrl: 'https://rival.test/',
          payload: { code: 'SAVE20' },
          observedAt: '2026-09-04T12:00:00.000Z',
          confidence: 0.9,
          snapshotId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
      ],
    });

    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence,
        observedChanges: [promotionAddition()],
      }),
    ).toEqual([]);
  });

  it('suppresses an addition without a coherent current observation', () => {
    expect(
      enrichObservedChanges({
        comparison: comparison(),
        subjectsEvidence: evidence(true, { priorFactType: 'offer.promo' }),
        observedChanges: [
          {
            ...promotionAddition(),
            currentObservationId: null,
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe('hydratePersistedSignals', () => {
  const signalId = '99999999-9999-4999-8999-999999999999';
  const hash = `sha256:${'b'.repeat(64)}`;

  function input(): {
    expectedSignalHashes: string[];
    rpcRows: unknown[];
    signalRows: unknown[];
    evidenceRows: unknown[];
  } {
    return {
      expectedSignalHashes: [hash],
      rpcRows: [{ id: signalId, signal_hash: hash, inserted: false }],
      signalRows: [
        {
          id: signalId,
          owned_brand_id: BRAND_ID,
          competitor_id: COMPETITOR_ID,
          signal_type: 'competitor_added_promotion',
          comparison_key: 'offer.promo:SAVE10',
          statement: 'rival.test added a promotion.',
          supporting_values: { previous: false, current: true },
          confidence: 'medium',
          direction: 'added',
          generated_at: '2026-09-01T12:00:00.000Z',
          rule_version: 'competitive-signals-v1',
          signal_hash: hash,
        },
      ],
      evidenceRows: [
        {
          signal_id: signalId,
          position: 0,
          role: 'competitor',
          source_id: SOURCE_ID,
          snapshot_id: CURRENT_SNAPSHOT_ID,
          observation_id: CURRENT_OBSERVATION_ID,
          prior_snapshot_id: null,
          prior_observation_id: null,
          observed_change_id: null,
          confidence: 0.8,
        },
      ],
    };
  }

  it('returns the persisted replay row and evidence instead of a newly generated candidate', () => {
    const signals = hydratePersistedSignals(input());
    expect(signals).toMatchObject([{ id: signalId, generatedAt: '2026-09-01T12:00:00.000Z' }]);
    expect(signals[0]?.evidence).toEqual([
      {
        role: 'competitor',
        sourceId: SOURCE_ID,
        snapshotId: CURRENT_SNAPSHOT_ID,
        observationId: CURRENT_OBSERVATION_ID,
        confidence: 0.8,
      },
    ]);
  });

  it('hydrates older detector versions for immutable history reads', () => {
    const persisted = input();
    persisted.signalRows[0] = {
      ...(persisted.signalRows[0] as Record<string, unknown>),
      rule_version: 'competitive-signals-v0',
    };

    expect(
      hydrateSignalRows({ signalRows: persisted.signalRows, evidenceRows: persisted.evidenceRows }),
    ).toMatchObject([{ id: signalId, ruleVersion: 'competitive-signals-v0' }]);
  });

  it('hydrates persisted prior-evaluation and current evidence with their lineage intact', () => {
    const persisted = input();
    persisted.evidenceRows = [
      {
        signal_id: signalId,
        position: 0,
        role: 'previous_evaluation',
        source_id: SOURCE_ID,
        snapshot_id: PREVIOUS_SNAPSHOT_ID,
        observation_id: PREVIOUS_OBSERVATION_ID,
        prior_snapshot_id: null,
        prior_observation_id: null,
        observed_change_id: CHANGE_ID,
        confidence: 0.37,
      },
      {
        signal_id: signalId,
        position: 1,
        role: 'current',
        source_id: SOURCE_ID,
        snapshot_id: CURRENT_SNAPSHOT_ID,
        observation_id: CURRENT_OBSERVATION_ID,
        prior_snapshot_id: null,
        prior_observation_id: null,
        observed_change_id: CHANGE_ID,
        confidence: 0.8,
      },
    ];

    expect(hydratePersistedSignals(persisted)[0]?.evidence).toEqual([
      {
        role: 'previous_evaluation',
        sourceId: SOURCE_ID,
        snapshotId: PREVIOUS_SNAPSHOT_ID,
        observationId: PREVIOUS_OBSERVATION_ID,
        observedChangeId: CHANGE_ID,
        confidence: 0.37,
      },
      {
        role: 'current',
        sourceId: SOURCE_ID,
        snapshotId: CURRENT_SNAPSHOT_ID,
        observationId: CURRENT_OBSERVATION_ID,
        observedChangeId: CHANGE_ID,
        confidence: 0.8,
      },
    ]);
  });

  it('rejects duplicate RPC IDs even when hashes differ', () => {
    const duplicate = input();
    duplicate.rpcRows.push({
      id: signalId,
      signal_hash: `sha256:${'c'.repeat(64)}`,
      inserted: true,
    });
    expect(() => hydratePersistedSignals(duplicate)).toThrow();
  });

  it('runtime-validates the RPC inserted flag', () => {
    const invalid = input();
    invalid.rpcRows[0] = { id: signalId, signal_hash: hash, inserted: 'false' } as never;
    expect(() => hydratePersistedSignals(invalid)).toThrow();
  });

  it('resolves only persisted signals whose hashes are in the current projection', () => {
    const persisted = hydratePersistedSignals(input())[0]!;
    const { id, ...candidate } = persisted;
    expect(id).toBe(signalId);
    const historicalOnly = {
      ...persisted,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      signalHash: `sha256:${'c'.repeat(64)}`,
    };

    expect(
      intersectCurrentPersistedSignals({
        projection: {
          ruleVersion: 'competitive-signals-v1',
          signals: [candidate],
          unresolved: [],
        },
        historicalSignals: [historicalOnly, persisted],
      }),
    ).toEqual([persisted]);
  });

  it('does not substitute history for an unresolved current identity', () => {
    const persisted = hydratePersistedSignals(input())[0]!;

    expect(
      intersectCurrentPersistedSignals({
        projection: {
          ruleVersion: 'competitive-signals-v1',
          signals: [],
          unresolved: [
            {
              logicalIdentity: {
                ownedBrandId: BRAND_ID,
                competitorId: COMPETITOR_ID,
                comparisonKey: persisted.comparisonKey,
                signalFamily: 'presence_difference',
              },
              state: 'unknown',
            },
          ],
        },
        historicalSignals: [persisted],
      }),
    ).toEqual([]);
  });
});

describe('observation subject validation', () => {
  it('rejects an observation assigned to a different subject than its source', () => {
    expect(() =>
      brandComparison.assertObservationSubject({
        observedSubjectId: BRAND_ID,
        sourceId: SOURCE_ID,
        expectedSubjectId: COMPETITOR_ID,
      }),
    ).toThrow('Observation subject does not match the source subject.');
  });
});
