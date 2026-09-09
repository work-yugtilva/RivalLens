import { brandComparisonRequestSchema } from '@rivallens/schemas';

import {
  hostAuthorityRank,
  mergeSubjectCurrentState,
  resolveSubjectProductFacts,
  type FactProvenance,
  type ResolvedFact,
  type SourceEvidence,
} from './current-state';

export type ComparisonSubject = {
  subjectType: 'brand' | 'competitor';
  subjectId: string;
  domain: string;
};

export type SubjectSourceEvidence = {
  subjectId: string;
  sources: SourceEvidence[];
};

export type ComparisonProvenance = {
  observationId: string | null;
  snapshotId: string;
  priorObservationId?: string;
  priorSnapshotId?: string;
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
};

export type ComparisonSubjectValue = {
  state: 'present' | 'explicitly_absent' | 'unknown';
  value: Record<string, unknown> | null;
  provenance: ComparisonProvenance | null;
};

export type ComparisonNumericDelta = {
  competitorSubjectId: string;
  ownedValue: number;
  competitorValue: number;
  difference: number;
  unit: 'usd' | 'days' | 'percent';
};

export type ComparisonFact = {
  key: string;
  valuesBySubjectId: Record<string, ComparisonSubjectValue>;
  numericDeltas?: ComparisonNumericDelta[];
};

export type ComparisonProduct = {
  productUrl: string;
  name?: ComparisonSubjectValue;
  price?: ComparisonSubjectValue;
  availability?: ComparisonSubjectValue;
};

export type ProductsBySubject = {
  productCount: number;
  products: ComparisonProduct[];
};

export type BrandComparisonResult = {
  brandId: string;
  generatedAt: string;
  ownedSubject: ComparisonSubject;
  competitors: ComparisonSubject[];
  facts: ComparisonFact[];
  productsBySubject: Record<string, ProductsBySubject>;
};

export type BuildBrandComparisonInput = {
  brandId: string;
  generatedAt: string;
  ownedSubject: ComparisonSubject;
  competitors: ComparisonSubject[];
  subjectsEvidence: SubjectSourceEvidence[];
};

const UNKNOWN_VALUE: ComparisonSubjectValue = {
  state: 'unknown',
  value: null,
  provenance: null,
};

function mapProvenance(provenance: FactProvenance): ComparisonProvenance {
  return {
    observationId: provenance.observationId,
    snapshotId: provenance.snapshotId,
    priorObservationId: provenance.priorObservationId,
    priorSnapshotId: provenance.priorSnapshotId,
    sourceId: provenance.sourceId,
    sourceUrl: provenance.sourceUrl,
    observedAt: provenance.observedAt,
    confidence: provenance.confidence,
  };
}

function presentValue(value: Record<string, unknown>, provenance: FactProvenance): ComparisonSubjectValue {
  return {
    state: 'present',
    value,
    provenance: mapProvenance(provenance),
  };
}

function absentValue(provenance: FactProvenance): ComparisonSubjectValue {
  return {
    state: 'explicitly_absent',
    value: null,
    provenance: mapProvenance(provenance),
  };
}

function resolvedToSubjectValue(fact: ResolvedFact | undefined): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'present') {
    return presentValue(fact.normalizedValue, fact.provenance);
  }
  return absentValue(fact.provenance);
}

function subscriptionAvailableValue(fact: ResolvedFact | undefined): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'explicitly_absent') return absentValue(fact.provenance);
  if (fact.status === 'present') {
    return presentValue({ available: fact.normalizedValue.available === true }, fact.provenance);
  }
  return UNKNOWN_VALUE;
}

function subscriptionDiscountValue(fact: ResolvedFact | undefined): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'explicitly_absent') return absentValue(fact.provenance);
  if (fact.status === 'present') {
    const discountPercent = fact.normalizedValue.discountPercent;
    if (typeof discountPercent !== 'number') return UNKNOWN_VALUE;
    return presentValue({ discountPercent }, fact.provenance);
  }
  return UNKNOWN_VALUE;
}

function freeShippingThresholdValue(fact: ResolvedFact | undefined): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'explicitly_absent') return absentValue(fact.provenance);
  if (fact.status === 'present') {
    const threshold = fact.normalizedValue.threshold;
    if (typeof threshold !== 'number') return UNKNOWN_VALUE;
    return presentValue({ threshold }, fact.provenance);
  }
  return UNKNOWN_VALUE;
}

function durationValue(fact: ResolvedFact | undefined): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'explicitly_absent') return absentValue(fact.provenance);
  if (fact.status === 'present') {
    const durationDays = fact.normalizedValue.durationDays;
    if (typeof durationDays !== 'number') return UNKNOWN_VALUE;
    return presentValue({ durationDays }, fact.provenance);
  }
  return UNKNOWN_VALUE;
}

function positioningFieldValue(
  fact: ResolvedFact | undefined,
  field: 'headline' | 'subheadline' | 'primaryCta',
): ComparisonSubjectValue {
  if (!fact) return UNKNOWN_VALUE;
  if (fact.status === 'explicitly_absent') return absentValue(fact.provenance);
  if (fact.status === 'present') {
    const text = fact.normalizedValue[field];
    if (typeof text !== 'string') return UNKNOWN_VALUE;
    return presentValue({ [field]: text }, fact.provenance);
  }
  return UNKNOWN_VALUE;
}

type ComparisonKeyBinding = {
  key: string;
  resolve: (fact: ResolvedFact | undefined) => ComparisonSubjectValue;
};

function bindingsForIdentity(factIdentity: string): ComparisonKeyBinding[] {
  if (factIdentity === 'offer:free_shipping') {
    return [{ key: 'offer.free_shipping_threshold', resolve: freeShippingThresholdValue }];
  }
  if (factIdentity.startsWith('offer:discount:')) {
    const parts = factIdentity.slice('offer:discount:'.length).split(':');
    const type = parts[0];
    return [{ key: `offer.discount:${type}`, resolve: resolvedToSubjectValue }];
  }
  if (factIdentity.startsWith('offer:promo:')) {
    const code = factIdentity.slice('offer:promo:'.length);
    return [{ key: `offer.promo:${code}`, resolve: resolvedToSubjectValue }];
  }
  if (factIdentity.startsWith('offer:bundle:')) {
    return [{ key: 'offer.bundle', resolve: resolvedToSubjectValue }];
  }
  if (factIdentity.startsWith('offer:buy_x_get_y:')) {
    return [{ key: 'offer.buy_x_get_y', resolve: resolvedToSubjectValue }];
  }
  if (factIdentity === 'subscription:details') {
    return [
      { key: 'subscription.available', resolve: subscriptionAvailableValue },
      { key: 'subscription.discount', resolve: subscriptionDiscountValue },
    ];
  }
  if (factIdentity === 'policy:guarantee') {
    return [{ key: 'policy.guarantee_duration', resolve: durationValue }];
  }
  if (factIdentity === 'policy:return_window') {
    return [{ key: 'policy.return_window', resolve: durationValue }];
  }
  if (factIdentity === 'positioning:homepage:headline') {
    return [{ key: 'positioning.homepage.headline', resolve: (fact) => positioningFieldValue(fact, 'headline') }];
  }
  if (factIdentity === 'positioning:homepage:subheadline') {
    return [{ key: 'positioning.homepage.subheadline', resolve: (fact) => positioningFieldValue(fact, 'subheadline') }];
  }
  if (factIdentity === 'positioning:homepage:primary_cta') {
    return [{ key: 'positioning.homepage.primary_cta', resolve: (fact) => positioningFieldValue(fact, 'primaryCta') }];
  }
  return [];
}

function pickBetterSubjectValue(
  left: ComparisonSubjectValue,
  right: ComparisonSubjectValue,
  key?: string,
  primaryDomain?: string,
): ComparisonSubjectValue {
  const rank = (value: ComparisonSubjectValue) => {
    if (value.state === 'present') return 3;
    if (value.state === 'explicitly_absent') return 2;
    return 1;
  };
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) return leftRank > rightRank ? left : right;

  if (left.state === 'present' && right.state === 'present' && key?.startsWith('offer.discount:')) {
    const leftHost = hostAuthorityRank(left.provenance?.sourceUrl ?? '', primaryDomain);
    const rightHost = hostAuthorityRank(right.provenance?.sourceUrl ?? '', primaryDomain);
    if (leftHost !== rightHost) {
      return leftHost < rightHost ? left : right;
    }

    const leftAmount = typeof left.value?.amount === 'number' ? left.value.amount : 0;
    const rightAmount = typeof right.value?.amount === 'number' ? right.value.amount : 0;
    if (leftAmount !== rightAmount) {
      return rightAmount > leftAmount ? right : left;
    }
  }

  const leftTime = left.provenance ? Date.parse(left.provenance.observedAt) : 0;
  const rightTime = right.provenance ? Date.parse(right.provenance.observedAt) : 0;
  return leftTime >= rightTime ? left : right;
}

function collectSubjectFacts(
  sources: SourceEvidence[],
  primaryDomain?: string,
): Map<string, ComparisonSubjectValue> {
  const factsByKey = new Map<string, ComparisonSubjectValue>();

  for (const [factIdentity, resolvedFact] of mergeSubjectCurrentState(sources, primaryDomain)) {
    for (const binding of bindingsForIdentity(factIdentity)) {
      const candidate = binding.resolve(resolvedFact);
      const existing = factsByKey.get(binding.key);
      factsByKey.set(
        binding.key,
        existing ? pickBetterSubjectValue(existing, candidate, binding.key, primaryDomain) : candidate,
      );
    }
  }

  return factsByKey;
}

function readNumericDelta(
  key: string,
  owned: ComparisonSubjectValue,
  competitor: ComparisonSubjectValue,
): { ownedValue: number; competitorValue: number; unit: ComparisonNumericDelta['unit'] } | null {
  if (owned.state !== 'present' || competitor.state !== 'present' || !owned.value || !competitor.value) {
    return null;
  }

  if (key === 'offer.free_shipping_threshold') {
    const ownedValue = owned.value.threshold;
    const competitorValue = competitor.value.threshold;
    if (typeof ownedValue !== 'number' || typeof competitorValue !== 'number') return null;
    return { ownedValue, competitorValue, unit: 'usd' };
  }

  if (key === 'policy.guarantee_duration' || key === 'policy.return_window') {
    const ownedValue = owned.value.durationDays;
    const competitorValue = competitor.value.durationDays;
    if (typeof ownedValue !== 'number' || typeof competitorValue !== 'number') return null;
    return { ownedValue, competitorValue, unit: 'days' };
  }

  if (key === 'subscription.discount') {
    const ownedValue = owned.value.discountPercent;
    const competitorValue = competitor.value.discountPercent;
    if (typeof ownedValue !== 'number' || typeof competitorValue !== 'number') return null;
    return { ownedValue, competitorValue, unit: 'percent' };
  }

  if (key === 'offer.discount:percentage') {
    const ownedValue = owned.value.amount;
    const competitorValue = competitor.value.amount;
    if (typeof ownedValue !== 'number' || typeof competitorValue !== 'number') return null;
    return { ownedValue, competitorValue, unit: 'percent' };
  }

  return null;
}

function mapProductFact(fact: ResolvedFact | null): ComparisonSubjectValue | undefined {
  if (!fact) return undefined;
  return resolvedToSubjectValue(fact);
}

export function buildBrandComparison(input: BuildBrandComparisonInput): BrandComparisonResult {
  const subjectIds = [input.ownedSubject.subjectId, ...input.competitors.map((competitor) => competitor.subjectId)];
  const evidenceBySubject = new Map(input.subjectsEvidence.map((entry) => [entry.subjectId, entry.sources]));

  const factsByKey = new Map<string, Record<string, ComparisonSubjectValue>>();
  const productsBySubject: BrandComparisonResult['productsBySubject'] = {};

  for (const subjectId of subjectIds) {
    const sources = evidenceBySubject.get(subjectId) ?? [];
    const subject = subjectId === input.ownedSubject.subjectId ? input.ownedSubject : input.competitors.find((c) => c.subjectId === subjectId);
    const subjectFacts = collectSubjectFacts(sources, subject?.domain);

    for (const [key, value] of subjectFacts) {
      const valuesBySubjectId = factsByKey.get(key) ?? {};
      valuesBySubjectId[subjectId] = value;
      factsByKey.set(key, valuesBySubjectId);
    }

    const products = resolveSubjectProductFacts(sources, subject?.domain).map((product) => ({
      productUrl: product.productUrl,
      name: mapProductFact(product.name),
      price: mapProductFact(product.currentPrice),
      availability: mapProductFact(product.availability),
    }));

    productsBySubject[subjectId] = {
      productCount: products.length,
      products,
    };
  }

  const facts: ComparisonFact[] = [...factsByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, valuesBySubjectId]) => {
      const completeValues: Record<string, ComparisonSubjectValue> = {};
      for (const subjectId of subjectIds) {
        completeValues[subjectId] = valuesBySubjectId[subjectId] ?? UNKNOWN_VALUE;
      }

      const ownedValue = completeValues[input.ownedSubject.subjectId];
      const numericDeltas = input.competitors.flatMap((competitor) => {
        const competitorValue = completeValues[competitor.subjectId];
        const numeric = readNumericDelta(key, ownedValue, competitorValue);
        if (!numeric) return [];
        return [{
          competitorSubjectId: competitor.subjectId,
          ownedValue: numeric.ownedValue,
          competitorValue: numeric.competitorValue,
          difference: numeric.competitorValue - numeric.ownedValue,
          unit: numeric.unit,
        }];
      });

      return numericDeltas.length > 0
        ? { key, valuesBySubjectId: completeValues, numericDeltas }
        : { key, valuesBySubjectId: completeValues };
    });

  return {
    brandId: input.brandId,
    generatedAt: input.generatedAt,
    ownedSubject: input.ownedSubject,
    competitors: input.competitors,
    facts,
    productsBySubject,
  };
}

export function parseBrandComparisonRequest(input: unknown): { competitorIds: string[] } {
  const parsed = brandComparisonRequestSchema.parse(input);
  const competitorIds = [...new Set(parsed.competitorIds)];
  return { competitorIds };
}
