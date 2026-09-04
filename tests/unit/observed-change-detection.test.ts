import { describe, expect, it } from 'vitest';
import {
  buildChangeHash,
  detectObservedChanges,
  type ComparableObservation,
} from '../../packages/domain/src/observed-changes';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const PREV_SNAPSHOT_ID = '33333333-3333-4333-8333-333333333333';
const CURR_SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';
const NEXT_SNAPSHOT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_URL = 'https://example.com/products/widget';
const DETECTED_AT = '2026-09-01T12:00:00.000Z';

let obsCounter = 0;

function obs(factType: string, payload: Record<string, unknown>): ComparableObservation {
  obsCounter += 1;
  return {
    id: `aaaaaaaa-bbbb-4ccc-8ddd-${String(obsCounter).padStart(12, '0')}`,
    factType,
    sourceUrl: SOURCE_URL,
    payload,
  };
}

function productBase(extra: ComparableObservation[] = []): ComparableObservation[] {
  return [
    obs('product.name', { name: 'Widget', canonicalUrl: SOURCE_URL }),
    obs('product.price', { currentPrice: 29, currency: 'USD' }),
    ...extra,
  ];
}

function detect(
  previousObservations: ComparableObservation[],
  currentObservations: ComparableObservation[],
  options?: {
    previousSnapshot?: { id: string; capturedAt: string } | null;
    currentSnapshotId?: string;
  },
) {
  return detectObservedChanges({
    subjectId: SUBJECT_ID,
    sourceId: SOURCE_ID,
    sourceType: 'product',
    currentSnapshot: {
      id: options?.currentSnapshotId ?? CURR_SNAPSHOT_ID,
      capturedAt: DETECTED_AT,
    },
    previousSnapshot:
      options?.previousSnapshot === undefined
        ? { id: PREV_SNAPSHOT_ID, capturedAt: DETECTED_AT }
        : options.previousSnapshot,
    currentObservations,
    previousObservations,
    detectedAt: DETECTED_AT,
  });
}

function changeTypes(changes: ReturnType<typeof detect>) {
  return changes.map((change) => change.changeType);
}

describe('detectObservedChanges', () => {
  describe('price', () => {
    it('detects product.price.increased when price rises 29 to 39', () => {
      const previous = productBase();
      const current = productBase();
      current[1] = obs('product.price', { currentPrice: 39, currency: 'USD' });

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'product.price.increased',
        beforeValue: { currentPrice: 29, currency: 'USD' },
        afterValue: { currentPrice: 39, currency: 'USD' },
      });
    });

    it('detects product.price.decreased when price falls 39 to 29', () => {
      const previous = productBase();
      previous[1] = obs('product.price', { currentPrice: 39, currency: 'USD' });
      const current = productBase();

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.changeType).toBe('product.price.decreased');
    });

    it('produces no change when price normalizes to the same value (29.00 to 29)', () => {
      const previous = productBase();
      previous[1] = obs('product.price', { currentPrice: 29.0, currency: 'USD' });
      const current = productBase();
      current[1] = obs('product.price', { currentPrice: 29, currency: 'USD' });

      expect(detect(previous, current)).toHaveLength(0);
    });
  });

  describe('availability', () => {
    it('detects product.availability.changed from in_stock to out_of_stock', () => {
      const previous = productBase([obs('product.availability', { availability: 'in_stock' })]);
      const current = productBase([obs('product.availability', { availability: 'out_of_stock' })]);

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'product.availability.changed',
        beforeValue: { availability: 'in_stock' },
        afterValue: { availability: 'out_of_stock' },
      });
    });
  });

  describe('offer', () => {
    it('detects offer.promo.added', () => {
      const changes = detect(
        productBase(),
        productBase([obs('offer.promo', { code: 'SAVE10' })]),
      );
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'offer.promo.added',
        afterValue: { code: 'SAVE10' },
      });
    });

    it('detects offer.promo.removed when offer category remains covered', () => {
      const previous = productBase([
        obs('offer.promo', { code: 'SAVE10' }),
        obs('offer.free_shipping', { threshold: 75 }),
      ]);
      const current = productBase([obs('offer.free_shipping', { threshold: 75 })]);

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'offer.promo.removed',
        beforeValue: { code: 'SAVE10' },
        afterValue: null,
      });
    });

    it('detects offer discount transition when percentage amount changes', () => {
      const previous = productBase([
        obs('offer.discount', { type: 'percentage', amount: 20 }),
        obs('offer.free_shipping', { threshold: 75 }),
      ]);
      const current = productBase([
        obs('offer.discount', { type: 'percentage', amount: 25 }),
        obs('offer.free_shipping', { threshold: 75 }),
      ]);

      const changes = detect(previous, current);
      expect(changeTypes(changes)).toEqual(
        expect.arrayContaining(['offer.discount.removed', 'offer.discount.added']),
      );
    });

    it('detects offer.free_shipping.threshold_changed when threshold moves 75 to 50', () => {
      const previous = productBase([obs('offer.free_shipping', { threshold: 75 })]);
      const current = productBase([obs('offer.free_shipping', { threshold: 50 })]);

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'offer.free_shipping.threshold_changed',
        beforeValue: { threshold: 75 },
        afterValue: { threshold: 50 },
      });
    });
  });

  describe('subscription', () => {
    it('detects subscription.added', () => {
      const changes = detect(
        productBase(),
        productBase([
          obs('subscription.details', { available: true, discountPercent: 15, frequency: 'monthly' }),
        ]),
      );
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'subscription.added',
        afterValue: { available: true, discountPercent: 15, frequency: 'monthly' },
      });
    });

    it('detects subscription.removed when subscription is absent but extraction succeeded on the page', () => {
      const previous = productBase([
        obs('subscription.details', { available: true, discountPercent: 15 }),
      ]);
      const current = productBase();

      const changes = detect(previous, current);
      expect(changeTypes(changes)).toContain('subscription.removed');
    });
    it('detects subscription.discount.changed', () => {
      const previous = productBase([
        obs('subscription.details', { available: true, discountPercent: 15, frequency: 'monthly' }),
      ]);
      const current = productBase([
        obs('subscription.details', { available: true, discountPercent: 20, frequency: 'monthly' }),
      ]);

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'subscription.discount.changed',
        beforeValue: { available: true, discountPercent: 15, frequency: 'monthly' },
        afterValue: { available: true, discountPercent: 20, frequency: 'monthly' },
      });
    });
  });

  describe('policies', () => {
    it('detects policy.guarantee.duration_changed from 30-day to 60-day guarantee', () => {
      const previous = [obs('policy.guarantee', { duration: 30, unit: 'days' })];
      const current = [obs('policy.guarantee', { duration: 60, unit: 'days' })];

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        changeType: 'policy.guarantee.duration_changed',
        beforeValue: { durationDays: 30 },
        afterValue: { durationDays: 60 },
      });
    });

    it('detects policy.return_window.duration_changed', () => {
      const previous = [obs('policy.return_window', { duration: 30, unit: 'days' })];
      const current = [obs('policy.return_window', { duration: 14, unit: 'days' })];

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.changeType).toBe('policy.return_window.duration_changed');
    });
  });

  describe('positioning', () => {
    const homepage = (payload: Record<string, unknown>) => [obs('positioning.homepage', payload)];

    it('detects positioning.homepage.headline_changed', () => {
      const previous = homepage({ headline: 'Old headline', primaryCta: 'Buy' });
      const current = homepage({ headline: 'New headline', primaryCta: 'Buy' });

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.changeType).toBe('positioning.homepage.headline_changed');
    });

    it('detects positioning.homepage.primary_cta_changed', () => {
      const previous = homepage({ headline: 'Headline', primaryCta: 'Buy now' });
      const current = homepage({ headline: 'Headline', primaryCta: 'Shop today' });

      const changes = detect(previous, current);
      expect(changes).toHaveLength(1);
      expect(changes[0]?.changeType).toBe('positioning.homepage.primary_cta_changed');
    });

    it('ignores whitespace-only headline changes', () => {
      const previous = homepage({ headline: 'Hello   world', primaryCta: 'Buy' });
      const current = homepage({ headline: 'Hello world', primaryCta: 'Buy' });

      expect(detect(previous, current)).toHaveLength(0);
    });
  });

  describe('history', () => {
    it('creates no changes for the first snapshot without a previous snapshot', () => {
      const changes = detect(productBase(), productBase(), { previousSnapshot: null });
      expect(changes).toHaveLength(0);
    });

    it('uses the correct prior state in beforeValue and snapshot lineage', () => {
      const previous = productBase();
      const current = productBase();
      current[1] = obs('product.price', { currentPrice: 39, currency: 'USD' });

      const changes = detect(previous, current);
      expect(changes[0]).toMatchObject({
        previousSnapshotId: PREV_SNAPSHOT_ID,
        currentSnapshotId: CURR_SNAPSHOT_ID,
        beforeValue: { currentPrice: 29, currency: 'USD' },
        afterValue: { currentPrice: 39, currency: 'USD' },
      });
    });

    it('is idempotent when reprocessing the same input', () => {
      const previous = productBase();
      const current = productBase();
      current[1] = obs('product.price', { currentPrice: 39, currency: 'USD' });

      const first = detect(previous, current);
      const second = detect(previous, current);

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]?.changeHash).toBe(second[0]?.changeHash);
      expect(first[0]?.changeHash).toBe(
        buildChangeHash({
          sourceId: SOURCE_ID,
          previousSnapshotId: PREV_SNAPSHOT_ID,
          currentSnapshotId: CURR_SNAPSHOT_ID,
          factIdentity: first[0]!.factIdentity,
          changeType: first[0]!.changeType,
          beforeValue: first[0]!.beforeValue,
          afterValue: first[0]!.afterValue,
        }),
      );
    });

    it('records a later transition against the correct prior snapshot', () => {
      const snapshotA = productBase();
      const snapshotB = productBase();
      snapshotB[1] = obs('product.price', { currentPrice: 39, currency: 'USD' });
      const snapshotC = productBase();
      snapshotC[1] = obs('product.price', { currentPrice: 49, currency: 'USD' });

      const firstTransition = detect(snapshotA, snapshotB, {
        currentSnapshotId: CURR_SNAPSHOT_ID,
      });
      const secondTransition = detect(snapshotB, snapshotC, {
        previousSnapshot: { id: CURR_SNAPSHOT_ID, capturedAt: DETECTED_AT },
        currentSnapshotId: NEXT_SNAPSHOT_ID,
      });

      expect(firstTransition[0]?.changeType).toBe('product.price.increased');
      expect(secondTransition).toHaveLength(1);
      expect(secondTransition[0]).toMatchObject({
        changeType: 'product.price.increased',
        previousSnapshotId: CURR_SNAPSHOT_ID,
        currentSnapshotId: NEXT_SNAPSHOT_ID,
        beforeValue: { currentPrice: 39, currency: 'USD' },
        afterValue: { currentPrice: 49, currency: 'USD' },
      });
    });
  });

  describe('evaluation scope hardening', () => {
    it('does not emit availability removal when price is extracted but availability is unknown', () => {
      const previous = productBase([obs('product.availability', { availability: 'in_stock' })]);
      const current = productBase();

      const changes = detect(previous, current);
      expect(changeTypes(changes)).not.toContain('product.availability.changed');
      expect(changeTypes(changes)).not.toEqual(expect.arrayContaining(['product.availability.changed']));
      expect(changes.some((change) => change.factIdentity.endsWith(':availability'))).toBe(false);
    });

    it('does not emit promo removal when only another offer type was evaluated', () => {
      const previous = productBase([
        obs('offer.promo', { code: 'SAVE10' }),
        obs('offer.free_shipping', { threshold: 75 }),
      ]);
      const current = productBase([obs('offer.discount', { type: 'percentage', amount: 20 })]);

      const changes = detect(previous, current);
      expect(changeTypes(changes)).not.toContain('offer.promo.removed');
    });

    it('emits promo removal when offer extraction succeeded and the promo is absent', () => {
      const previous = productBase([
        obs('offer.promo', { code: 'SAVE10' }),
        obs('offer.free_shipping', { threshold: 75 }),
      ]);
      const current = productBase([obs('offer.free_shipping', { threshold: 75 })]);

      const changes = detect(previous, current);
      expect(changeTypes(changes)).toContain('offer.promo.removed');
    });

    it('does not emit removals when the current snapshot has no observations', () => {
      const previous = productBase([
        obs('offer.promo', { code: 'SAVE10' }),
        obs('subscription.details', { available: true, discountPercent: 15 }),
        obs('product.availability', { availability: 'in_stock' }),
      ]);
      expect(detect(previous, [])).toHaveLength(0);
    });

    it('detects genuine subscription removal when extraction succeeded without subscription facts', () => {
      const previous = productBase([
        obs('subscription.details', { available: true, discountPercent: 15 }),
      ]);
      const current = productBase();

      const changes = detect(previous, current);
      expect(changeTypes(changes)).toContain('subscription.removed');
    });

    it('does not emit offer removals when current snapshot only covers a different category', () => {
      const previous = productBase([obs('offer.promo', { code: 'SAVE10' })]);
      const current = productBase();

      const changes = detect(previous, current);
      expect(changeTypes(changes)).not.toContain('offer.promo.removed');
    });
  });
});
