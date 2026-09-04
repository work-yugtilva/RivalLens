import { createHash } from 'node:crypto';
import {
  competitiveSignalCandidateSchema,
  type BrandComparisonResult,
  type ComparisonProvenance,
  type ComparisonSubjectValue,
  type CompetitiveSignalCandidate,
  type CompetitiveSignalConfidence,
  type CompetitiveSignalDirection,
  type CompetitiveSignalEvidenceReference,
  type CurrentCompetitiveSignalFamily,
  type CurrentCompetitiveSignalLogicalIdentity,
  type CurrentCompetitiveSignalsProjection,
  type CompetitiveSignalSupportingValues,
  type CompetitiveSignalType,
  type ObservedChange,
} from '@rivallens/schemas';

export const COMPETITIVE_SIGNAL_RULE_VERSION = 'competitive-signals-v1';
export const CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION = COMPETITIVE_SIGNAL_RULE_VERSION;
export const SUPPORTED_CURRENT_COMPETITIVE_SIGNAL_RULE_VERSIONS = [
  CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION,
] as const;

export type EvidenceEnrichedObservedChange = {
  change: ObservedChange;
  evidence: CompetitiveSignalEvidenceReference[];
};

export type DetectCompetitiveSignalsInput = {
  comparison: BrandComparisonResult;
  observedChanges: EvidenceEnrichedObservedChange[];
  generatedAt: string;
};

export type ResolveCurrentCompetitiveSignalsInput = {
  comparison: BrandComparisonResult;
  historicalSignals: Array<Pick<CompetitiveSignalCandidate, 'ownedBrandId' | 'competitorId' | 'comparisonKey' | 'signalType' | 'ruleVersion'>>;
  generatedAt: string;
};

type SignalDraft = Omit<
  CompetitiveSignalCandidate,
  'confidence' | 'generatedAt' | 'ruleVersion' | 'signalHash'
>;
type NumericRule = {
  key: string;
  field: string;
  unit: 'usd' | 'days' | 'percentage_points';
  lowerType: CompetitiveSignalType;
  higherType: CompetitiveSignalType;
  lowerStatement: (domain: string, difference: number) => string;
  higherStatement: (domain: string, difference: number) => string;
};

const NUMERIC_RULES: NumericRule[] = [
  {
    key: 'offer.free_shipping_threshold',
    field: 'threshold',
    unit: 'usd',
    lowerType: 'competitor_lower_free_shipping_threshold',
    higherType: 'competitor_higher_free_shipping_threshold',
    lowerStatement: (domain, difference) =>
      `${domain}'s free-shipping threshold is ${money(difference)} lower than the owned brand's.`,
    higherStatement: (domain, difference) =>
      `${domain}'s free-shipping threshold is ${money(difference)} higher than the owned brand's.`,
  },
  {
    key: 'policy.return_window',
    field: 'durationDays',
    unit: 'days',
    lowerType: 'competitor_shorter_return_window',
    higherType: 'competitor_longer_return_window',
    lowerStatement: (domain, difference) =>
      `${domain}'s return window is ${formatNumber(difference)} days shorter than the owned brand's.`,
    higherStatement: (domain, difference) =>
      `${domain}'s return window is ${formatNumber(difference)} days longer than the owned brand's.`,
  },
  {
    key: 'policy.guarantee_duration',
    field: 'durationDays',
    unit: 'days',
    lowerType: 'competitor_shorter_guarantee_duration',
    higherType: 'competitor_longer_guarantee_duration',
    lowerStatement: (domain, difference) =>
      `${domain}'s guarantee duration is ${formatNumber(difference)} days shorter than the owned brand's.`,
    higherStatement: (domain, difference) =>
      `${domain}'s guarantee duration is ${formatNumber(difference)} days longer than the owned brand's.`,
  },
  {
    key: 'subscription.discount',
    field: 'discountPercent',
    unit: 'percentage_points',
    lowerType: 'competitor_lower_subscription_discount',
    higherType: 'competitor_higher_subscription_discount',
    lowerStatement: (domain, difference) =>
      `${domain}'s subscription discount is ${formatNumber(difference)} percentage points lower than the owned brand's.`,
    higherStatement: (domain, difference) =>
      `${domain}'s subscription discount is ${formatNumber(difference)} percentage points higher than the owned brand's.`,
  },
];

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}

function money(value: number): string {
  return `$${formatNumber(value)}`;
}

function numericField(value: ComparisonSubjectValue | undefined, field: string): number | null {
  const candidate = value?.state === 'present' ? value.value?.[field] : undefined;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function stringField(value: ComparisonSubjectValue | undefined, field: string): string | null {
  const candidate = value?.state === 'present' ? value.value?.[field] : undefined;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function fromProvenance(
  role: 'owned' | 'competitor',
  provenance: ComparisonProvenance | null,
): CompetitiveSignalEvidenceReference | null {
  if (!provenance) return null;
  return {
    role,
    sourceId: provenance.sourceId,
    snapshotId: provenance.snapshotId,
    observationId: provenance.observationId,
    ...(provenance.priorSnapshotId ? { priorSnapshotId: provenance.priorSnapshotId } : {}),
    ...(provenance.priorObservationId ? { priorObservationId: provenance.priorObservationId } : {}),
    confidence: provenance.confidence,
  };
}

function comparisonEvidence(
  owned: ComparisonSubjectValue | undefined,
  competitor: ComparisonSubjectValue | undefined,
): CompetitiveSignalEvidenceReference[] | null {
  const ownedEvidence = fromProvenance('owned', owned?.provenance ?? null);
  const competitorEvidence = fromProvenance('competitor', competitor?.provenance ?? null);
  return ownedEvidence && competitorEvidence ? [ownedEvidence, competitorEvidence] : null;
}

function confidenceFor(
  evidence: CompetitiveSignalEvidenceReference[],
): CompetitiveSignalConfidence | null {
  if (evidence.length === 0 || evidence.some((reference) => !Number.isFinite(reference.confidence)))
    return null;
  const weakest = Math.min(...evidence.map((reference) => reference.confidence));
  if (weakest < 0 || weakest > 1) return null;
  return weakest >= 0.9 ? 'high' : weakest >= 0.75 ? 'medium' : 'low';
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function buildSignalHash(signal: SignalDraft): string {
  const canonical = {
    ruleVersion: COMPETITIVE_SIGNAL_RULE_VERSION,
    signalType: signal.signalType,
    ownedBrandId: signal.ownedBrandId,
    competitorId: signal.competitorId,
    comparisonKey: signal.comparisonKey,
    direction: signal.direction ?? null,
    supportingValues: signal.supportingValues,
    evidence: signal.evidence.map((reference) => JSON.stringify(stableValue(reference))).sort(),
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(canonical)))
    .digest('hex')}`;
}

function uniqueEvidence(
  evidence: CompetitiveSignalEvidenceReference[],
): CompetitiveSignalEvidenceReference[] {
  return [
    ...new Map(
      evidence.map((reference) => [JSON.stringify(stableValue(reference)), reference]),
    ).values(),
  ];
}

function finishSignal(draft: SignalDraft, generatedAt: string): CompetitiveSignalCandidate | null {
  const confidence = confidenceFor(draft.evidence);
  if (!confidence) return null;
  const parsed = competitiveSignalCandidateSchema.safeParse({
    ...draft,
    confidence,
    generatedAt,
    ruleVersion: COMPETITIVE_SIGNAL_RULE_VERSION,
    signalHash: buildSignalHash(draft),
  });
  return parsed.success ? parsed.data : null;
}

function uniqueFact(comparison: BrandComparisonResult, key: string) {
  const matches = comparison.facts.filter((candidate) => candidate.key === key);
  return matches.length === 1 ? matches[0] : undefined;
}

function numericComparisonDrafts(
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): SignalDraft[] {
  return NUMERIC_RULES.flatMap((rule) => {
    const fact = uniqueFact(comparison, rule.key);
    if (!fact) return [];
    const owned = fact.valuesBySubjectId[comparison.ownedSubject.subjectId];
    const competitor = fact.valuesBySubjectId[competitorId];
    const ownedValue = numericField(owned, rule.field);
    const competitorValue = numericField(competitor, rule.field);
    if (ownedValue === null || competitorValue === null) return [];
    const delta = competitorValue - ownedValue;
    const declared = fact.numericDeltas?.find(
      (candidate) => candidate.competitorSubjectId === competitorId,
    );
    const declaredUnit = rule.unit === 'percentage_points' ? 'percent' : rule.unit;
    if (
      !declared ||
      delta === 0 ||
      declared.ownedValue !== ownedValue ||
      declared.competitorValue !== competitorValue ||
      declared.difference !== delta ||
      declared.unit !== declaredUnit
    )
      return [];
    const discountEvidence = comparisonEvidence(owned, competitor);
    if (!discountEvidence) return [];
    let evidence = discountEvidence;
    if (rule.key === 'subscription.discount') {
      const availability = uniqueFact(comparison, 'subscription.available');
      if (!availability) return [];
      const ownedAvailability = availability.valuesBySubjectId[comparison.ownedSubject.subjectId];
      const competitorAvailability = availability.valuesBySubjectId[competitorId];
      if (
        ownedAvailability?.state !== 'present' ||
        ownedAvailability.value?.available !== true ||
        competitorAvailability?.state !== 'present' ||
        competitorAvailability.value?.available !== true
      ) {
        return [];
      }
      const availabilityEvidence = comparisonEvidence(ownedAvailability, competitorAvailability);
      if (!availabilityEvidence) return [];
      evidence = uniqueEvidence([...discountEvidence, ...availabilityEvidence]);
    }
    const lower = delta < 0;
    return [
      {
        signalType: lower ? rule.lowerType : rule.higherType,
        ownedBrandId: comparison.brandId,
        competitorId,
        comparisonKey: rule.key,
        statement: lower
          ? rule.lowerStatement(domain, Math.abs(delta))
          : rule.higherStatement(domain, delta),
        supportingValues: {
          owned: ownedValue,
          competitor: competitorValue,
          delta,
          unit: rule.unit,
        },
        evidence,
        direction: lower ? ('competitor_lower' as const) : ('competitor_higher' as const),
      },
    ];
  });
}

function subscriptionPresenceDraft(
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): SignalDraft | null {
  const fact = uniqueFact(comparison, 'subscription.available');
  if (!fact) return null;
  const owned = fact.valuesBySubjectId[comparison.ownedSubject.subjectId];
  const competitor = fact.valuesBySubjectId[competitorId];
  const ownedOffers = owned?.state === 'present' && owned.value?.available === true;
  const competitorOffers = competitor?.state === 'present' && competitor.value?.available === true;
  const ownedAbsent = owned?.state === 'explicitly_absent';
  const competitorAbsent = competitor?.state === 'explicitly_absent';
  if (!(competitorOffers && ownedAbsent) && !(ownedOffers && competitorAbsent)) return null;
  const evidence = comparisonEvidence(owned, competitor);
  if (!evidence) return null;
  return {
    signalType: competitorOffers
      ? 'competitor_offers_subscription_owned_does_not'
      : 'owned_offers_subscription_competitor_does_not',
    ownedBrandId: comparison.brandId,
    competitorId,
    comparisonKey: fact.key,
    statement: competitorOffers
      ? `${domain} offers a subscription while the owned brand does not.`
      : `The owned brand offers a subscription while ${domain} does not.`,
    supportingValues: { owned: ownedOffers, competitor: competitorOffers },
    evidence,
    direction: 'different',
  };
}

type PresenceRule = {
  prefix: string;
  competitorType: CompetitiveSignalType;
  ownedType: CompetitiveSignalType;
  label: string;
};

const PRESENCE_RULES: PresenceRule[] = [
  {
    prefix: 'offer.discount:',
    competitorType: 'competitor_offers_explicit_discount_owned_does_not',
    ownedType: 'owned_offers_explicit_discount_competitor_does_not',
    label: 'an explicit discount',
  },
  {
    prefix: 'offer.promo:',
    competitorType: 'competitor_offers_promotion_owned_does_not',
    ownedType: 'owned_offers_promotion_competitor_does_not',
    label: 'a promotion',
  },
  {
    prefix: 'offer.bundle',
    competitorType: 'competitor_offers_bundle_owned_does_not',
    ownedType: 'owned_offers_bundle_competitor_does_not',
    label: 'a bundle',
  },
  {
    prefix: 'offer.buy_x_get_y',
    competitorType: 'competitor_offers_bogo_owned_does_not',
    ownedType: 'owned_offers_bogo_competitor_does_not',
    label: 'a buy-one-get-one offer',
  },
];

function normalizedDiscountPayload(value: Record<string, unknown> | null) {
  if (!value) return null;
  const { type, amount } = value;
  if (
    (type !== 'percentage' && type !== 'fixed') ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }
  return { type, amount };
}

function normalizedDiscount(value: ComparisonSubjectValue | undefined) {
  return value?.state === 'present' ? normalizedDiscountPayload(value.value) : null;
}

function comparisonDiscountIdentityMatches(
  key: string,
  value: ComparisonSubjectValue | undefined,
): boolean {
  if (value?.state !== 'present') return true;
  const discount = normalizedDiscount(value);
  return discount !== null && key === `offer.discount:${discount.type}:${discount.amount}`;
}

function presenceDrafts(
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): SignalDraft[] {
  return PRESENCE_RULES.flatMap((rule) => {
    const candidates = comparison.facts
      .filter((fact) => fact.key.startsWith(rule.prefix))
      .flatMap((fact) => {
        const owned = fact.valuesBySubjectId[comparison.ownedSubject.subjectId];
        const competitor = fact.valuesBySubjectId[competitorId];
        const competitorOnly =
          competitor?.state === 'present' && owned?.state === 'explicitly_absent';
        const ownedOnly = owned?.state === 'present' && competitor?.state === 'explicitly_absent';
        if (!competitorOnly && !ownedOnly) return [];
        if (
          rule.prefix === 'offer.discount:' &&
          (!comparisonDiscountIdentityMatches(fact.key, owned) ||
            !comparisonDiscountIdentityMatches(fact.key, competitor))
        ) {
          return [];
        }
        const evidence = comparisonEvidence(owned, competitor);
        if (!evidence) return [];
        return [
          {
            signalType: competitorOnly ? rule.competitorType : rule.ownedType,
            ownedBrandId: comparison.brandId,
            competitorId,
            comparisonKey: fact.key,
            statement: competitorOnly
              ? `${domain} offers ${rule.label} while the owned brand does not.`
              : `The owned brand offers ${rule.label} while ${domain} does not.`,
            supportingValues: { owned: ownedOnly, competitor: competitorOnly },
            evidence,
            direction: 'different' as const,
          },
        ];
      });
    return candidates.length === 1 ? candidates : [];
  });
}

function presentDiscounts(comparison: BrandComparisonResult, subjectId: string) {
  return comparison.facts
    .filter((fact) => fact.key.startsWith('offer.discount:'))
    .flatMap((fact) => {
      const subjectValue = fact.valuesBySubjectId[subjectId];
      const discount = normalizedDiscount(subjectValue);
      if (!discount || !comparisonDiscountIdentityMatches(fact.key, subjectValue)) return [];
      return [{ ...discount, subjectValue }];
    });
}

function percentageDiscountDraft(
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): SignalDraft | null {
  const owned = presentDiscounts(comparison, comparison.ownedSubject.subjectId);
  const competitor = presentDiscounts(comparison, competitorId);
  if (owned.length !== 1 || competitor.length !== 1) return null;
  const ownedDiscount = owned[0]!;
  const competitorDiscount = competitor[0]!;
  if (
    ownedDiscount.type !== 'percentage' ||
    competitorDiscount.type !== 'percentage' ||
    typeof ownedDiscount.amount !== 'number' ||
    !Number.isFinite(ownedDiscount.amount) ||
    typeof competitorDiscount.amount !== 'number' ||
    !Number.isFinite(competitorDiscount.amount)
  )
    return null;
  const delta = competitorDiscount.amount - ownedDiscount.amount;
  if (delta === 0) return null;
  const evidence = comparisonEvidence(ownedDiscount.subjectValue, competitorDiscount.subjectValue);
  if (!evidence) return null;
  const higher = delta > 0;
  return {
    signalType: higher
      ? 'competitor_higher_explicit_percentage_discount'
      : 'competitor_lower_explicit_percentage_discount',
    ownedBrandId: comparison.brandId,
    competitorId,
    comparisonKey: 'offer.discount.explicit_percentage',
    statement: `${domain}'s explicit percentage discount is ${formatNumber(Math.abs(delta))} percentage points ${higher ? 'higher' : 'lower'} than the owned brand's.`,
    supportingValues: {
      owned: ownedDiscount.amount,
      competitor: competitorDiscount.amount,
      delta,
      unit: 'percentage_points',
    },
    evidence,
    direction: higher ? 'competitor_higher' : 'competitor_lower',
  };
}

function positioningDrafts(
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): SignalDraft[] {
  const fields = [
    { key: 'positioning.homepage.headline', field: 'headline', label: 'homepage headline' },
    { key: 'positioning.homepage.primary_cta', field: 'primaryCta', label: 'homepage primary CTA' },
  ] as const;
  return fields.flatMap(({ key, field, label }) => {
    const fact = uniqueFact(comparison, key);
    if (!fact) return [];
    const owned = fact.valuesBySubjectId[comparison.ownedSubject.subjectId];
    const competitor = fact.valuesBySubjectId[competitorId];
    const ownedValue = stringField(owned, field);
    const competitorValue = stringField(competitor, field);
    if (ownedValue === null || competitorValue === null || ownedValue === competitorValue)
      return [];
    const evidence = comparisonEvidence(owned, competitor);
    if (!evidence) return [];
    return [
      {
        signalType: 'positioning_differs' as const,
        ownedBrandId: comparison.brandId,
        competitorId,
        comparisonKey: key,
        statement: `${domain}'s ${label} differs from the owned brand's.`,
        supportingValues: { owned: ownedValue, competitor: competitorValue },
        evidence,
        direction: 'different' as const,
      },
    ];
  });
}

function requiredChangeEvidence(
  enriched: EvidenceEnrichedObservedChange,
  roles: CompetitiveSignalEvidenceReference['role'][],
  exact = false,
): CompetitiveSignalEvidenceReference[] | null {
  const { change, evidence } = enriched;
  if (
    evidence.some(
      (reference) =>
        reference.observedChangeId !== change.id || reference.sourceId !== change.sourceId,
    )
  )
    return null;
  const selected = roles.map((role) => {
    const matches = evidence.filter((reference) => reference.role === role);
    return matches.length === 1 ? matches[0] : undefined;
  });
  if (selected.some((reference) => !reference) || (exact && evidence.length !== roles.length)) {
    return null;
  }
  for (const reference of selected as CompetitiveSignalEvidenceReference[]) {
    if (reference.role === 'previous_evaluation') {
      if (
        change.previousSnapshotId === null ||
        change.previousObservationId !== null ||
        reference.snapshotId !== change.previousSnapshotId ||
        reference.observationId === null
      ) {
        return null;
      }
    } else if (reference.role === 'previous') {
      if (
        change.previousSnapshotId === null ||
        reference.snapshotId !== change.previousSnapshotId ||
        (change.previousObservationId !== null &&
          reference.observationId !== change.previousObservationId)
      )
        return null;
    } else if (
      reference.snapshotId !== change.currentSnapshotId ||
      (reference.role === 'current' &&
        change.currentObservationId !== null &&
        reference.observationId !== change.currentObservationId)
    )
      return null;
  }
  return selected as CompetitiveSignalEvidenceReference[];
}

function readNumber(value: Record<string, unknown> | null, field: string): number | null {
  const candidate = value?.[field];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function hasFactIdentity(change: ObservedChange, factType: string, identity: string): boolean {
  return change.factType === factType && change.factIdentity === identity;
}

function hasFactIdentityFamily(
  change: ObservedChange,
  factType: string,
  identityPrefix: string,
): boolean {
  return (
    change.factType === factType &&
    change.factIdentity.startsWith(identityPrefix) &&
    change.factIdentity.length > identityPrefix.length
  );
}

function promoIdentityMatches(
  change: ObservedChange,
  value: Record<string, unknown> | null,
): boolean {
  const code = value?.code;
  return (
    typeof code === 'string' &&
    code.trim().length > 0 &&
    change.factIdentity === `offer:promo:${code.trim().toUpperCase()}`
  );
}

function discountChangeIdentityMatches(
  change: ObservedChange,
  value: Record<string, unknown> | null,
): boolean {
  const discount = normalizedDiscountPayload(value);
  return (
    discount !== null &&
    change.factType === 'offer.discount' &&
    change.factIdentity === `offer:discount:${discount.type}:${discount.amount}`
  );
}

function hasCoherentChangeFact(change: ObservedChange): boolean {
  switch (change.changeType) {
    case 'offer.free_shipping.threshold_changed':
      return hasFactIdentity(change, 'offer.free_shipping', 'offer:free_shipping');
    case 'offer.discount.changed':
      return false;
    case 'subscription.added':
    case 'subscription.removed':
    case 'subscription.discount.changed':
      return hasFactIdentity(change, 'subscription.details', 'subscription:details');
    case 'policy.guarantee.duration_changed':
      return hasFactIdentity(change, 'policy.guarantee', 'policy:guarantee');
    case 'policy.return_window.duration_changed':
      return hasFactIdentity(change, 'policy.return_window', 'policy:return_window');
    case 'offer.promo.added':
      return (
        hasFactIdentityFamily(change, 'offer.promo', 'offer:promo:') &&
        promoIdentityMatches(change, change.afterValue)
      );
    case 'offer.promo.removed':
      return (
        hasFactIdentityFamily(change, 'offer.promo', 'offer:promo:') &&
        promoIdentityMatches(change, change.beforeValue)
      );
    case 'positioning.homepage.headline_changed':
      return hasFactIdentity(change, 'positioning.homepage', 'positioning:homepage:headline');
    default:
      return false;
  }
}

function numericChangeDraft(input: {
  enriched: EvidenceEnrichedObservedChange;
  comparison: BrandComparisonResult;
  domain: string;
  previous: number;
  current: number;
  key: string;
  unit: 'usd' | 'days' | 'percentage_points';
  higherType: CompetitiveSignalType;
  lowerType: CompetitiveSignalType;
  higherVerb: string;
  lowerVerb: string;
  label: string;
  format: (value: number) => string;
}): SignalDraft | null {
  const evidence = requiredChangeEvidence(input.enriched, ['previous', 'current']);
  const delta = input.current - input.previous;
  if (!evidence || delta === 0) return null;
  const higher = delta > 0;
  return {
    signalType: higher ? input.higherType : input.lowerType,
    ownedBrandId: input.comparison.brandId,
    competitorId: input.enriched.change.subjectId,
    comparisonKey: input.key,
    statement: `${input.domain} ${higher ? input.higherVerb : input.lowerVerb} its ${input.label} from ${input.format(input.previous)} to ${input.format(input.current)}.`,
    supportingValues: { previous: input.previous, current: input.current, delta, unit: input.unit },
    evidence,
    direction: higher ? 'competitor_higher' : 'competitor_lower',
  };
}

function simpleChangeDraft(
  enriched: EvidenceEnrichedObservedChange,
  comparison: BrandComparisonResult,
  domain: string,
  input: {
    roles: CompetitiveSignalEvidenceReference['role'][];
    signalType: CompetitiveSignalType;
    key: string;
    statement: string;
    direction: CompetitiveSignalDirection;
    supportingValues: CompetitiveSignalSupportingValues;
    exactEvidence?: boolean;
  },
): SignalDraft | null {
  const evidence = requiredChangeEvidence(enriched, input.roles, input.exactEvidence);
  if (!evidence) return null;
  return {
    signalType: input.signalType,
    ownedBrandId: comparison.brandId,
    competitorId: enriched.change.subjectId,
    comparisonKey: input.key,
    statement: input.statement.replace('{domain}', domain),
    supportingValues: input.supportingValues,
    evidence,
    direction: input.direction,
  };
}

function standaloneChangeDraft(
  enriched: EvidenceEnrichedObservedChange,
  comparison: BrandComparisonResult,
  domain: string,
): SignalDraft | null {
  const change = enriched.change;
  if (!hasCoherentChangeFact(change)) return null;
  switch (change.changeType) {
    case 'offer.free_shipping.threshold_changed': {
      const previous = readNumber(change.beforeValue, 'threshold');
      const current = readNumber(change.afterValue, 'threshold');
      return previous === null || current === null
        ? null
        : numericChangeDraft({
            enriched,
            comparison,
            domain,
            previous,
            current,
            key: 'offer.free_shipping_threshold',
            unit: 'usd',
            higherType: 'competitor_raised_free_shipping_threshold',
            lowerType: 'competitor_lowered_free_shipping_threshold',
            higherVerb: 'raised',
            lowerVerb: 'lowered',
            label: 'free-shipping threshold',
            format: money,
          });
    }
    case 'subscription.discount.changed': {
      if (change.beforeValue?.available !== true || change.afterValue?.available !== true) {
        return null;
      }
      const previous = readNumber(change.beforeValue, 'discountPercent');
      const current = readNumber(change.afterValue, 'discountPercent');
      return previous === null || current === null
        ? null
        : numericChangeDraft({
            enriched,
            comparison,
            domain,
            previous,
            current,
            key: 'subscription.discount',
            unit: 'percentage_points',
            higherType: 'competitor_increased_subscription_discount',
            lowerType: 'competitor_decreased_subscription_discount',
            higherVerb: 'increased',
            lowerVerb: 'decreased',
            label: 'subscription discount',
            format: (value) => `${formatNumber(value)}%`,
          });
    }
    case 'policy.guarantee.duration_changed':
    case 'policy.return_window.duration_changed': {
      const previous = readNumber(change.beforeValue, 'durationDays');
      const current = readNumber(change.afterValue, 'durationDays');
      const guarantee = change.changeType === 'policy.guarantee.duration_changed';
      return previous === null || current === null
        ? null
        : numericChangeDraft({
            enriched,
            comparison,
            domain,
            previous,
            current,
            key: guarantee ? 'policy.guarantee_duration' : 'policy.return_window',
            unit: 'days',
            higherType: guarantee
              ? 'competitor_extended_guarantee_duration'
              : 'competitor_extended_return_window',
            lowerType: guarantee
              ? 'competitor_shortened_guarantee_duration'
              : 'competitor_shortened_return_window',
            higherVerb: 'extended',
            lowerVerb: 'shortened',
            label: guarantee ? 'guarantee duration' : 'return window',
            format: (value) => `${formatNumber(value)} days`,
          });
    }
    case 'subscription.added':
      return change.beforeValue !== null || change.afterValue?.available !== true
        ? null
        : simpleChangeDraft(enriched, comparison, domain, {
            roles: ['previous_evaluation', 'current'],
            signalType: 'competitor_added_subscription',
            key: 'subscription.available',
            statement: '{domain} added a subscription.',
            direction: 'added',
            supportingValues: { previous: false, current: true },
            exactEvidence: true,
          });
    case 'subscription.removed':
      return change.beforeValue?.available !== true || change.afterValue !== null
        ? null
        : simpleChangeDraft(enriched, comparison, domain, {
            roles: ['previous', 'evaluation'],
            signalType: 'competitor_removed_subscription',
            key: 'subscription.available',
            statement: '{domain} removed its subscription.',
            direction: 'removed',
            supportingValues: { previous: true, current: false },
          });
    case 'offer.promo.added':
      return change.beforeValue !== null || change.afterValue === null
        ? null
        : simpleChangeDraft(enriched, comparison, domain, {
            roles: ['previous_evaluation', 'current'],
            signalType: 'competitor_added_promotion',
            key: 'offer.promo',
            statement: '{domain} added a promotion.',
            direction: 'added',
            supportingValues: { previous: false, current: true },
            exactEvidence: true,
          });
    case 'offer.promo.removed':
      return change.beforeValue === null || change.afterValue !== null
        ? null
        : simpleChangeDraft(enriched, comparison, domain, {
            roles: ['previous', 'evaluation'],
            signalType: 'competitor_removed_promotion',
            key: 'offer.promo',
            statement: '{domain} removed a promotion.',
            direction: 'removed',
            supportingValues: { previous: true, current: false },
          });
    case 'positioning.homepage.headline_changed': {
      const previous =
        typeof change.beforeValue?.headline === 'string' ? change.beforeValue.headline : null;
      const current =
        typeof change.afterValue?.headline === 'string' ? change.afterValue.headline : null;
      return !previous || !current || previous === current
        ? null
        : simpleChangeDraft(enriched, comparison, domain, {
            roles: ['previous', 'current'],
            signalType: 'competitor_changed_homepage_headline',
            key: 'positioning.homepage.headline',
            statement: '{domain} changed its homepage headline.',
            direction: 'different',
            supportingValues: { previous, current },
          });
    }
    default:
      return null;
  }
}

function pairedPercentageDiscountDraft(
  changes: EvidenceEnrichedObservedChange[],
  comparison: BrandComparisonResult,
  competitorId: string,
  domain: string,
): { draft: SignalDraft; consumed: Set<string> } | null {
  const discounts = changes.filter(
    (entry) =>
      entry.change.subjectId === competitorId &&
      hasFactIdentityFamily(entry.change, 'offer.discount', 'offer:discount:'),
  );
  const removed = discounts.filter((entry) => entry.change.changeType === 'offer.discount.removed');
  const added = discounts.filter((entry) => entry.change.changeType === 'offer.discount.added');
  if (removed.length !== 1 || added.length !== 1) return null;
  const removal = removed[0]!;
  const addition = added[0]!;
  if (
    removal.change.beforeValue?.type !== 'percentage' ||
    addition.change.afterValue?.type !== 'percentage' ||
    !discountChangeIdentityMatches(removal.change, removal.change.beforeValue) ||
    !discountChangeIdentityMatches(addition.change, addition.change.afterValue) ||
    removal.change.previousSnapshotId === null ||
    addition.change.previousSnapshotId === null ||
    removal.change.previousSnapshotId !== addition.change.previousSnapshotId ||
    removal.change.currentSnapshotId !== addition.change.currentSnapshotId ||
    removal.change.sourceId !== addition.change.sourceId
  )
    return null;
  const previous = readNumber(removal.change.beforeValue, 'amount');
  const current = readNumber(addition.change.afterValue, 'amount');
  const previousEvidence = requiredChangeEvidence(removal, ['previous', 'evaluation']);
  const currentEvidence = requiredChangeEvidence(addition, ['current']);
  if (
    previous === null ||
    current === null ||
    previous === current ||
    !previousEvidence ||
    !currentEvidence
  )
    return null;
  const delta = current - previous;
  const higher = delta > 0;
  return {
    draft: {
      signalType: higher
        ? 'competitor_increased_explicit_percentage_discount'
        : 'competitor_decreased_explicit_percentage_discount',
      ownedBrandId: comparison.brandId,
      competitorId,
      comparisonKey: 'offer.discount.explicit_percentage',
      statement: `${domain} ${higher ? 'increased' : 'decreased'} its explicit percentage discount from ${formatNumber(previous)}% to ${formatNumber(current)}%.`,
      supportingValues: { previous, current, delta, unit: 'percentage_points' },
      evidence: [...previousEvidence, ...currentEvidence],
      direction: higher ? 'competitor_higher' : 'competitor_lower',
    },
    consumed: new Set([removal.change.id, addition.change.id]),
  };
}

function changeDrafts(input: DetectCompetitiveSignalsInput): SignalDraft[] {
  const drafts: SignalDraft[] = [];
  for (const competitor of input.comparison.competitors) {
    const paired = pairedPercentageDiscountDraft(
      input.observedChanges,
      input.comparison,
      competitor.subjectId,
      competitor.domain,
    );
    if (paired) drafts.push(paired.draft);
    for (const enriched of input.observedChanges) {
      if (
        enriched.change.subjectId !== competitor.subjectId ||
        paired?.consumed.has(enriched.change.id)
      )
        continue;
      const draft = standaloneChangeDraft(enriched, input.comparison, competitor.domain);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

function comparisonDrafts(comparison: BrandComparisonResult): SignalDraft[] {
  const drafts: SignalDraft[] = [];
  for (const competitor of comparison.competitors) {
    drafts.push(...numericComparisonDrafts(comparison, competitor.subjectId, competitor.domain));
    const subscription = subscriptionPresenceDraft(comparison, competitor.subjectId, competitor.domain);
    if (subscription) drafts.push(subscription);
    drafts.push(...presenceDrafts(comparison, competitor.subjectId, competitor.domain));
    const discount = percentageDiscountDraft(comparison, competitor.subjectId, competitor.domain);
    if (discount) drafts.push(discount);
    drafts.push(...positioningDrafts(comparison, competitor.subjectId, competitor.domain));
  }
  return drafts;
}

function finishedSignals(drafts: SignalDraft[], generatedAt: string): CompetitiveSignalCandidate[] {
  const signals = drafts
    .flatMap((draft) => {
      const signal = finishSignal(draft, generatedAt);
      return signal ? [signal] : [];
    })
    .sort(
      (left, right) =>
        (left.competitorId ?? '').localeCompare(right.competitorId ?? '') ||
        left.comparisonKey.localeCompare(right.comparisonKey) ||
        left.signalType.localeCompare(right.signalType) ||
        left.signalHash.localeCompare(right.signalHash),
    );
  return [...new Map(signals.map((signal) => [signal.signalHash, signal])).values()];
}

const RELATIVE_NUMERIC_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_lower_free_shipping_threshold',
  'competitor_higher_free_shipping_threshold',
  'competitor_longer_return_window',
  'competitor_shorter_return_window',
  'competitor_longer_guarantee_duration',
  'competitor_shorter_guarantee_duration',
  'competitor_higher_subscription_discount',
  'competitor_lower_subscription_discount',
  'competitor_higher_explicit_percentage_discount',
  'competitor_lower_explicit_percentage_discount',
]);

const PRESENCE_DIFFERENCE_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_offers_subscription_owned_does_not',
  'owned_offers_subscription_competitor_does_not',
  'competitor_offers_explicit_discount_owned_does_not',
  'owned_offers_explicit_discount_competitor_does_not',
  'competitor_offers_promotion_owned_does_not',
  'owned_offers_promotion_competitor_does_not',
  'competitor_offers_bundle_owned_does_not',
  'owned_offers_bundle_competitor_does_not',
  'competitor_offers_bogo_owned_does_not',
  'owned_offers_bogo_competitor_does_not',
]);

export function currentCompetitiveSignalFamily(
  signalType: CompetitiveSignalType,
): CurrentCompetitiveSignalFamily | null {
  if (RELATIVE_NUMERIC_SIGNAL_TYPES.has(signalType)) return 'relative_numeric';
  if (PRESENCE_DIFFERENCE_SIGNAL_TYPES.has(signalType)) return 'presence_difference';
  return signalType === 'positioning_differs' ? 'positioning_difference' : null;
}

export function currentCompetitiveSignalLogicalIdentity(
  signal: Pick<CompetitiveSignalCandidate, 'ownedBrandId' | 'competitorId' | 'comparisonKey' | 'signalType'>,
): CurrentCompetitiveSignalLogicalIdentity | null {
  const signalFamily = currentCompetitiveSignalFamily(signal.signalType);
  return signalFamily
    ? {
        ownedBrandId: signal.ownedBrandId,
        competitorId: signal.competitorId,
        comparisonKey: signal.comparisonKey,
        signalFamily,
      }
    : null;
}

function logicalIdentityKey(identity: CurrentCompetitiveSignalLogicalIdentity): string {
  return [
    identity.ownedBrandId,
    identity.competitorId,
    identity.comparisonKey,
    identity.signalFamily,
  ].join(':');
}

function comparisonValue(
  comparison: BrandComparisonResult,
  comparisonKey: string,
  subjectId: string,
): ComparisonSubjectValue | undefined {
  const matches = comparison.facts.filter((fact) => fact.key === comparisonKey);
  return matches.length === 1 ? matches[0]?.valuesBySubjectId[subjectId] : undefined;
}

function isUnknown(value: ComparisonSubjectValue | undefined): boolean {
  return !value || value.state === 'unknown';
}

function identityIsUnknown(
  comparison: BrandComparisonResult,
  identity: CurrentCompetitiveSignalLogicalIdentity,
): boolean {
  const owned = comparisonValue(comparison, identity.comparisonKey, identity.ownedBrandId);
  const competitor = comparisonValue(comparison, identity.comparisonKey, identity.competitorId);
  if (isUnknown(owned) || isUnknown(competitor)) return true;

  if (
    identity.signalFamily === 'relative_numeric' &&
    identity.comparisonKey === 'subscription.discount'
  ) {
    return (
      isUnknown(comparisonValue(comparison, 'subscription.available', identity.ownedBrandId)) ||
      isUnknown(comparisonValue(comparison, 'subscription.available', identity.competitorId))
    );
  }
  return false;
}

/**
 * Resolves only enduring comparative conditions. Change-event signals stay in immutable history.
 */
export function resolveCurrentCompetitiveSignals(
  input: ResolveCurrentCompetitiveSignalsInput,
): CurrentCompetitiveSignalsProjection {
  const signals = finishedSignals(comparisonDrafts(input.comparison), input.generatedAt).map((signal) => ({
    ...signal,
    ruleVersion: CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION,
  }));
  const activeIdentities = new Set(
    signals.flatMap((signal) => {
      const identity = currentCompetitiveSignalLogicalIdentity(signal);
      return identity ? [logicalIdentityKey(identity)] : [];
    }),
  );
  const historicalIdentities = new Map<string, CurrentCompetitiveSignalLogicalIdentity>();
  for (const signal of input.historicalSignals) {
    if (signal.ruleVersion !== CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION) continue;
    const identity = currentCompetitiveSignalLogicalIdentity(signal);
    if (identity) historicalIdentities.set(logicalIdentityKey(identity), identity);
  }
  const unresolved = [...historicalIdentities.entries()]
    .filter(([key, identity]) => !activeIdentities.has(key) && identityIsUnknown(input.comparison, identity))
    .map(([, logicalIdentity]) => ({ logicalIdentity, state: 'unknown' as const }))
    .sort((left, right) => logicalIdentityKey(left.logicalIdentity).localeCompare(logicalIdentityKey(right.logicalIdentity)));

  return {
    ruleVersion: CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION,
    signals,
    unresolved,
  };
}

export function detectCompetitiveSignals(
  input: DetectCompetitiveSignalsInput,
): CompetitiveSignalCandidate[] {
  return finishedSignals([...comparisonDrafts(input.comparison), ...changeDrafts(input)], input.generatedAt);
}
