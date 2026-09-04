import { createHash } from 'node:crypto';
import type { ObservedChangeCandidate, ObservedChangeType } from '@rivallens/schemas';

export const DETECTOR_VERSION = 'website-change-detector-v2';

export type FactCategory = 'product' | 'offer' | 'subscription' | 'policy' | 'positioning';

export type ComparableObservation = {
  id: string;
  factType: string;
  payload: Record<string, unknown>;
  sourceUrl: string;
};

export type DetectObservedChangesInput = {
  subjectId: string;
  sourceId: string;
  sourceType: string;
  currentSnapshot: { id: string; capturedAt: string };
  previousSnapshot: { id: string; capturedAt: string } | null;
  currentObservations: ComparableObservation[];
  previousObservations: ComparableObservation[];
  detectedAt: string;
};

export type FactEntry = {
  factIdentity: string;
  factType: string;
  observation: ComparableObservation;
  normalizedValue: Record<string, unknown>;
  category: FactCategory;
};

const TRACKING_PARAM = /^(utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|mc_[a-z0-9_]+|_ga)$/i;

export function getFactCategory(factType: string): FactCategory | null {
  if (factType.startsWith('product.')) return 'product';
  if (factType.startsWith('offer.')) return 'offer';
  if (factType.startsWith('subscription.')) return 'subscription';
  if (factType.startsWith('policy.')) return 'policy';
  if (factType.startsWith('positioning.')) return 'positioning';
  return null;
}

export function hasCategoryCoverage(observations: ComparableObservation[], category: FactCategory): boolean {
  return observations.some((observation) => getFactCategory(observation.factType) === category);
}

export type EvaluationScope = string;

const OFFER_FACT_TYPES = [
  'offer.discount',
  'offer.promo',
  'offer.bundle',
  'offer.buy_x_get_y',
  'offer.free_shipping',
] as const;

const SUBSCRIPTION_SOURCE_TYPES = new Set(['homepage', 'product', 'subscription']);

export function removalEvaluationScope(factIdentity: string, factType: string): EvaluationScope | null {
  if (factIdentity.endsWith(':availability')) return 'product.availability';
  if (factIdentity.endsWith(':price:current')) return 'product.price:current';
  if (factIdentity.endsWith(':price:compare_at')) return 'product.price:compare_at';
  if (factIdentity.startsWith('positioning:homepage:')) {
    return factIdentity.replace('positioning:homepage:', 'positioning.homepage:');
  }
  if ((OFFER_FACT_TYPES as readonly string[]).includes(factType)) return factType;
  if (factType === 'subscription.details') return 'subscription.details';
  if (factType === 'policy.guarantee') return 'policy.guarantee';
  if (factType === 'policy.return_window') return 'policy.return_window';
  return null;
}

export function computeEvaluatedScopes(sourceType: string, observations: ComparableObservation[]): Set<EvaluationScope> {
  const scopes = new Set<EvaluationScope>();
  const factTypesPresent = new Set(observations.map((observation) => observation.factType));
  const hasAnyObservation = observations.length > 0;

  for (const observation of observations) {
    if (observation.factType === 'product.price') {
      if (observation.payload.currentPrice !== undefined) scopes.add('product.price:current');
      if (observation.payload.compareAtPrice !== undefined) scopes.add('product.price:compare_at');
    }
    if (observation.factType === 'product.availability') scopes.add('product.availability');
    if (observation.factType === 'product.name') scopes.add('product.name');
  }

  const TEXT_OFFER_TYPES = ['offer.discount', 'offer.promo', 'offer.bundle', 'offer.buy_x_get_y'] as const;
  const anyOfferObservation = OFFER_FACT_TYPES.some((factType) => factTypesPresent.has(factType));

  for (const factType of OFFER_FACT_TYPES) {
    if (factTypesPresent.has(factType)) scopes.add(factType);
  }

  if (factTypesPresent.has('offer.free_shipping')) {
    for (const factType of TEXT_OFFER_TYPES) scopes.add(factType);
  }

  if (sourceType === 'pricing_offers' && anyOfferObservation) {
    for (const factType of OFFER_FACT_TYPES) scopes.add(factType);
  }

  if (factTypesPresent.has('subscription.details')) {
    scopes.add('subscription.details');
  } else if (SUBSCRIPTION_SOURCE_TYPES.has(sourceType) && hasAnyObservation) {
    scopes.add('subscription.details');
  }

  if (sourceType === 'shipping_returns' && hasAnyObservation) {
    scopes.add('policy.guarantee');
    scopes.add('policy.return_window');
  }
  if (factTypesPresent.has('policy.guarantee')) scopes.add('policy.guarantee');
  if (factTypesPresent.has('policy.return_window')) scopes.add('policy.return_window');

  const positioning = observations.find((observation) => observation.factType === 'positioning.homepage');
  if (positioning) {
    scopes.add('positioning.homepage');
    scopes.add('positioning.homepage:headline');
    scopes.add('positioning.homepage:subheadline');
    scopes.add('positioning.homepage:primary_cta');
  }

  return scopes;
}

export function canEmitRemoval(
  factIdentity: string,
  factType: string,
  evaluatedScopes: Set<EvaluationScope>,
): boolean {
  const scope = removalEvaluationScope(factIdentity, factType);
  return scope !== null && evaluatedScopes.has(scope);
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    }
    return url.href;
  } catch {
    return value.trim();
  }
}

function normalizePrice(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function durationToDays(duration: number, unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith('month')) return duration * 30;
  if (normalized.startsWith('year')) return duration * 365;
  return duration;
}

function normalizeDuration(payload: Record<string, unknown>): Record<string, unknown> | null {
  const duration = typeof payload.duration === 'number' ? payload.duration : Number(payload.duration);
  const unit = typeof payload.unit === 'string' ? payload.unit : '';
  if (!Number.isFinite(duration) || !unit) return null;
  return { durationDays: durationToDays(duration, unit) };
}

export function normalizeFactValue(factType: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  switch (factType) {
    case 'product.name': {
      if (typeof payload.name !== 'string') return null;
      const normalized: Record<string, unknown> = { name: normalizeText(payload.name) };
      if (typeof payload.canonicalUrl === 'string') {
        normalized.canonicalUrl = normalizeComparableUrl(payload.canonicalUrl);
      }
      return normalized;
    }
    case 'product.price': {
      if (payload.currentPrice !== undefined) {
        const currentPrice = normalizePrice(payload.currentPrice);
        if (currentPrice === null) return null;
        const normalized: Record<string, unknown> = { currentPrice };
        if (typeof payload.currency === 'string') normalized.currency = payload.currency.toUpperCase();
        return normalized;
      }
      if (payload.compareAtPrice !== undefined) {
        const compareAtPrice = normalizePrice(payload.compareAtPrice);
        if (compareAtPrice === null) return null;
        const normalized: Record<string, unknown> = { compareAtPrice };
        if (typeof payload.currency === 'string') normalized.currency = payload.currency.toUpperCase();
        return normalized;
      }
      return null;
    }
    case 'product.availability': {
      if (typeof payload.availability !== 'string') return null;
      return { availability: payload.availability };
    }
    case 'offer.discount': {
      const type = typeof payload.type === 'string' ? payload.type : null;
      const amount = normalizePrice(payload.amount);
      if (!type || amount === null) return null;
      return { type, amount };
    }
    case 'offer.promo': {
      if (typeof payload.code !== 'string') return null;
      return { code: payload.code.trim().toUpperCase() };
    }
    case 'offer.free_shipping': {
      const normalized: Record<string, unknown> = {};
      if (payload.threshold !== undefined) {
        const threshold = normalizePrice(payload.threshold);
        if (threshold !== null) normalized.threshold = threshold;
      }
      return normalized;
    }
    case 'offer.bundle':
    case 'offer.buy_x_get_y': {
      if (typeof payload.text !== 'string') return null;
      return { text: normalizeText(payload.text) };
    }
    case 'subscription.details': {
      const normalized: Record<string, unknown> = { available: payload.available === true };
      if (payload.discountPercent !== undefined) {
        const discountPercent = normalizePrice(payload.discountPercent);
        if (discountPercent !== null) normalized.discountPercent = discountPercent;
      }
      if (typeof payload.frequency === 'string') normalized.frequency = normalizeText(payload.frequency);
      return normalized;
    }
    case 'policy.guarantee':
    case 'policy.return_window':
      return normalizeDuration(payload);
    case 'positioning.homepage': {
      const normalized: Record<string, unknown> = {};
      if (typeof payload.headline === 'string') normalized.headline = normalizeText(payload.headline);
      if (typeof payload.subheadline === 'string') normalized.subheadline = normalizeText(payload.subheadline);
      if (typeof payload.primaryCta === 'string') normalized.primaryCta = normalizeText(payload.primaryCta);
      return Object.keys(normalized).length > 0 ? normalized : null;
    }
    default:
      return null;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function buildChangeHash(input: {
  sourceId: string;
  previousSnapshotId: string | null;
  currentSnapshotId: string;
  factIdentity: string;
  changeType: ObservedChangeType;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
}): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      sourceId: input.sourceId,
      previousSnapshotId: input.previousSnapshotId,
      currentSnapshotId: input.currentSnapshotId,
      factIdentity: input.factIdentity,
      changeType: input.changeType,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
    }),
  );
  return 'sha256:' + hash.digest('hex');
}

function valuesEqual(left: Record<string, unknown> | null, right: Record<string, unknown> | null): boolean {
  if (left === null || right === null) return left === right;
  return stableJson(left) === stableJson(right);
}

function resolveProductUrl(observations: ComparableObservation[], sourceUrl: string): string {
  const nameObservation = observations.find(
    (observation) => observation.factType === 'product.name' && observation.sourceUrl === sourceUrl,
  );
  const canonicalUrl =
    typeof nameObservation?.payload.canonicalUrl === 'string'
      ? nameObservation.payload.canonicalUrl
      : sourceUrl;
  return normalizeComparableUrl(canonicalUrl);
}

function expandObservation(
  observation: ComparableObservation,
  observations: ComparableObservation[],
): FactEntry[] {
  const category = getFactCategory(observation.factType);
  if (!category) return [];

  if (observation.factType === 'positioning.homepage') {
    const fields = [
      { identity: 'positioning:homepage:headline', key: 'headline' },
      { identity: 'positioning:homepage:subheadline', key: 'subheadline' },
      { identity: 'positioning:homepage:primary_cta', key: 'primaryCta' },
    ] as const;

    return fields.flatMap((field) => {
      const raw = observation.payload[field.key];
      if (typeof raw !== 'string') return [];
      const normalizedValue = { [field.key]: normalizeText(raw) };
      return [{
        factIdentity: field.identity,
        factType: observation.factType,
        observation,
        normalizedValue,
        category,
      }];
    });
  }

  const normalizedValue = normalizeFactValue(observation.factType, observation.payload);
  if (!normalizedValue) return [];

  const factIdentity = buildFactIdentity(observation, observations, normalizedValue);
  if (!factIdentity) return [];

  return [{
    factIdentity,
    factType: observation.factType,
    observation,
    normalizedValue,
    category,
  }];
}

function buildFactIdentity(
  observation: ComparableObservation,
  observations: ComparableObservation[],
  normalizedValue: Record<string, unknown>,
): string | null {
  switch (observation.factType) {
    case 'product.name': {
      const url =
        typeof observation.payload.canonicalUrl === 'string'
          ? normalizeComparableUrl(observation.payload.canonicalUrl)
          : resolveProductUrl(observations, observation.sourceUrl);
      return 'product:' + url + ':name';
    }
    case 'product.price': {
      const productUrl = resolveProductUrl(observations, observation.sourceUrl);
      if (normalizedValue.currentPrice !== undefined) return 'product:' + productUrl + ':price:current';
      if (normalizedValue.compareAtPrice !== undefined) return 'product:' + productUrl + ':price:compare_at';
      return null;
    }
    case 'product.availability':
      return 'product:' + resolveProductUrl(observations, observation.sourceUrl) + ':availability';
    case 'offer.discount':
      return 'offer:discount:' + String(normalizedValue.type) + ':' + String(normalizedValue.amount);
    case 'offer.promo':
      return 'offer:promo:' + String(normalizedValue.code);
    case 'offer.free_shipping':
      return 'offer:free_shipping';
    case 'offer.bundle':
      return 'offer:bundle:' + String(normalizedValue.text);
    case 'offer.buy_x_get_y':
      return 'offer:buy_x_get_y:' + String(normalizedValue.text);
    case 'subscription.details':
      return 'subscription:details';
    case 'policy.guarantee':
      return 'policy:guarantee';
    case 'policy.return_window':
      return 'policy:return_window';
    default:
      return null;
  }
}

export function buildFactIndex(observations: ComparableObservation[]): Map<string, FactEntry> {
  const index = new Map<string, FactEntry>();
  for (const observation of observations) {
    for (const entry of expandObservation(observation, observations)) {
      index.set(entry.factIdentity, entry);
    }
  }
  return index;
}

function resolveChangeType(
  factIdentity: string,
  factType: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  kind: 'added' | 'removed' | 'changed',
): ObservedChangeType | null {
  if (kind === 'added') {
    switch (factType) {
      case 'offer.discount': return 'offer.discount.added';
      case 'offer.promo': return 'offer.promo.added';
      case 'offer.free_shipping': return 'offer.free_shipping.added';
      case 'offer.bundle': return 'offer.bundle.added';
      case 'offer.buy_x_get_y': return 'offer.buy_x_get_y.added';
      case 'subscription.details': return 'subscription.added';
      default: return null;
    }
  }

  if (kind === 'removed') {
    switch (factType) {
      case 'offer.discount': return 'offer.discount.removed';
      case 'offer.promo': return 'offer.promo.removed';
      case 'offer.free_shipping': return 'offer.free_shipping.removed';
      case 'offer.bundle': return 'offer.bundle.removed';
      case 'offer.buy_x_get_y': return 'offer.buy_x_get_y.removed';
      case 'subscription.details': return 'subscription.removed';
      default: return null;
    }
  }

  if (factIdentity.endsWith(':price:current')) {
    const beforePrice = before?.currentPrice;
    const afterPrice = after?.currentPrice;
    if (typeof beforePrice !== 'number' || typeof afterPrice !== 'number') return null;
    if (afterPrice > beforePrice) return 'product.price.increased';
    if (afterPrice < beforePrice) return 'product.price.decreased';
    return null;
  }

  if (factIdentity.endsWith(':price:compare_at')) return 'product.price.compare_at_changed';
  if (factIdentity.endsWith(':availability')) return 'product.availability.changed';

  switch (factType) {
    case 'offer.discount': return 'offer.discount.changed';
    case 'offer.promo': return 'offer.promo.changed';
    case 'offer.free_shipping': return 'offer.free_shipping.threshold_changed';
    case 'offer.bundle': return 'offer.bundle.changed';
    case 'offer.buy_x_get_y': return 'offer.buy_x_get_y.changed';
    case 'subscription.details': {
      const beforeDiscount = before?.discountPercent;
      const afterDiscount = after?.discountPercent;
      if (typeof beforeDiscount === 'number' && typeof afterDiscount === 'number' && beforeDiscount !== afterDiscount) {
        return 'subscription.discount.changed';
      }
      return null;
    }
    case 'policy.guarantee': return 'policy.guarantee.duration_changed';
    case 'policy.return_window': return 'policy.return_window.duration_changed';
    case 'positioning.homepage':
      if (factIdentity.endsWith(':headline')) return 'positioning.homepage.headline_changed';
      if (factIdentity.endsWith(':subheadline')) return 'positioning.homepage.subheadline_changed';
      if (factIdentity.endsWith(':primary_cta')) return 'positioning.homepage.primary_cta_changed';
      return null;
    default: return null;
  }
}

function buildCandidate(
  input: DetectObservedChangesInput,
  entry: {
    factIdentity: string;
    factType: string;
    changeType: ObservedChangeType;
    before: FactEntry | null;
    after: FactEntry | null;
  },
): ObservedChangeCandidate {
  const beforeValue = entry.before?.normalizedValue ?? null;
  const afterValue = entry.after?.normalizedValue ?? null;
  return {
    subjectId: input.subjectId,
    sourceId: input.sourceId,
    factType: entry.factType,
    changeType: entry.changeType,
    previousSnapshotId: input.previousSnapshot!.id,
    currentSnapshotId: input.currentSnapshot.id,
    previousObservationId: entry.before?.observation.id ?? null,
    currentObservationId: entry.after?.observation.id ?? null,
    factIdentity: entry.factIdentity,
    beforeValue,
    afterValue,
    detectedAt: input.detectedAt,
    detectorVersion: DETECTOR_VERSION,
    changeHash: buildChangeHash({
      sourceId: input.sourceId,
      previousSnapshotId: input.previousSnapshot!.id,
      currentSnapshotId: input.currentSnapshot.id,
      factIdentity: entry.factIdentity,
      changeType: entry.changeType,
      beforeValue,
      afterValue,
    }),
  };
}

export function detectObservedChanges(input: DetectObservedChangesInput): ObservedChangeCandidate[] {
  if (!input.previousSnapshot || input.currentObservations.length === 0) return [];

  const previousIndex = buildFactIndex(input.previousObservations);
  const currentIndex = buildFactIndex(input.currentObservations);
  const evaluatedScopes = computeEvaluatedScopes(input.sourceType, input.currentObservations);
  const identities = new Set([...previousIndex.keys(), ...currentIndex.keys()]);
  const changes: ObservedChangeCandidate[] = [];

  for (const factIdentity of identities) {
    const before = previousIndex.get(factIdentity) ?? null;
    const after = currentIndex.get(factIdentity) ?? null;
    const factType = after?.factType ?? before?.factType;
    if (!factType) continue;

    if (before && after) {
      if (valuesEqual(before.normalizedValue, after.normalizedValue)) continue;
      const changeType = resolveChangeType(
        factIdentity,
        factType,
        before.normalizedValue,
        after.normalizedValue,
        'changed',
      );
      if (!changeType) continue;
      changes.push(buildCandidate(input, { factIdentity, factType, changeType, before, after }));
      continue;
    }

    if (before && !after) {
      if (!canEmitRemoval(factIdentity, factType, evaluatedScopes)) continue;
      const changeType = resolveChangeType(factIdentity, factType, before.normalizedValue, null, 'removed');
      if (!changeType) continue;
      changes.push(buildCandidate(input, { factIdentity, factType, changeType, before, after: null }));
      continue;
    }

    if (!before && after) {
      const changeType = resolveChangeType(factIdentity, factType, null, after.normalizedValue, 'added');
      if (!changeType) continue;
      changes.push(buildCandidate(input, { factIdentity, factType, changeType, before: null, after }));
    }
  }

  return changes;
}
