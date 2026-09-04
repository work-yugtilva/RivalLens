import { createHash } from 'node:crypto';
import {
  competitiveSignalSchema,
  currentCompetitiveSignalUnresolvedSchema,
  currentStrategicHypothesesProjectionSchema,
  strategicHypothesisCandidateSchema,
  strategicHypothesisSchema,
  STRATEGIC_HYPOTHESIS_CANONICAL_COPY,
  type CompetitiveSignal,
  type CompetitiveSignalConfidence,
  type CompetitiveSignalType,
  type CurrentCompetitiveSignalLogicalIdentity,
  type CurrentCompetitiveSignalUnresolved,
  type CurrentStrategicHypothesisLogicalIdentity,
  type StrategicHypothesis,
  type StrategicHypothesisCandidate,
  type StrategicHypothesisType,
} from '@rivallens/schemas';
import { currentCompetitiveSignalLogicalIdentity } from './signals';

export const STRATEGIC_HYPOTHESIS_ENGINE_VERSION = 'strategic-hypotheses-v1';
export const SUPPORTED_HYPOTHESIS_SIGNAL_RULE_VERSION = 'competitive-signals-v1';

export type GenerateStrategicHypothesesInput = {
  currentSignals: CompetitiveSignal[];
  generatedAt: string;
};

export type ResolveCurrentStrategicHypothesesInput = {
  currentSignals: CompetitiveSignal[];
  currentSignalUnresolved: CurrentCompetitiveSignalUnresolved[];
  historicalHypotheses: StrategicHypothesis[];
  historicalSignals: CompetitiveSignal[];
  generatedAt: string;
};

const SHIPPING_FRICTION_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_lower_free_shipping_threshold',
]);

const PERCEIVED_RISK_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_longer_return_window',
  'competitor_longer_guarantee_duration',
]);

const REPEAT_PURCHASE_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_offers_subscription_owned_does_not',
  'competitor_higher_subscription_discount',
]);

const PROMOTIONAL_INCENTIVE_SIGNAL_TYPES = new Set<CompetitiveSignalType>([
  'competitor_higher_explicit_percentage_discount',
  'competitor_offers_explicit_discount_owned_does_not',
  'competitor_offers_promotion_owned_does_not',
  'competitor_offers_bundle_owned_does_not',
  'competitor_offers_bogo_owned_does_not',
]);

type HypothesisSignalGroup =
  | 'shipping'
  | 'perceived_risk'
  | 'repeat_purchase'
  | 'promotional_incentives';

function signalGroupForType(signalType: CompetitiveSignalType): HypothesisSignalGroup | null {
  if (SHIPPING_FRICTION_SIGNAL_TYPES.has(signalType)) return 'shipping';
  if (PERCEIVED_RISK_SIGNAL_TYPES.has(signalType)) return 'perceived_risk';
  if (REPEAT_PURCHASE_SIGNAL_TYPES.has(signalType)) return 'repeat_purchase';
  if (PROMOTIONAL_INCENTIVE_SIGNAL_TYPES.has(signalType)) return 'promotional_incentives';
  return null;
}

function requiredGroups(hypothesisType: StrategicHypothesisType): HypothesisSignalGroup[] {
  switch (hypothesisType) {
    case 'competitor_may_reduce_shipping_friction':
      return ['shipping'];
    case 'competitor_may_reduce_perceived_purchase_risk':
      return ['perceived_risk'];
    case 'competitor_may_emphasize_repeat_purchase_mechanics':
      return ['repeat_purchase'];
    case 'competitor_may_emphasize_promotional_incentives':
      return ['promotional_incentives'];
    case 'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives':
      return ['shipping', 'perceived_risk', 'repeat_purchase'];
  }
}

function currentSignalIdentityKey(identity: CurrentCompetitiveSignalLogicalIdentity): string {
  return [
    identity.ownedBrandId,
    identity.competitorId,
    identity.comparisonKey,
    identity.signalFamily,
  ].join(':');
}

function currentHypothesisIdentity(
  hypothesis: Pick<
    StrategicHypothesisCandidate,
    'ownedBrandId' | 'competitorId' | 'hypothesisType'
  >,
): CurrentStrategicHypothesisLogicalIdentity {
  return {
    ownedBrandId: hypothesis.ownedBrandId,
    competitorId: hypothesis.competitorId,
    hypothesisType: hypothesis.hypothesisType,
  };
}

function currentHypothesisIdentityKey(identity: CurrentStrategicHypothesisLogicalIdentity): string {
  return [identity.ownedBrandId, identity.competitorId, identity.hypothesisType].join(':');
}

function sameSignalIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function signalsOfTypes(
  signals: CompetitiveSignal[],
  allowedTypes: Set<CompetitiveSignalType>,
): CompetitiveSignal[] {
  return signals.filter((signal) => allowedTypes.has(signal.signalType));
}

function uniqueSignals(signals: CompetitiveSignal[]): CompetitiveSignal[] {
  const byId = new Map<string, CompetitiveSignal>();
  for (const signal of signals) byId.set(signal.id, signal);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function hypothesisConfidence(signals: CompetitiveSignal[]): CompetitiveSignalConfidence {
  const rank: Record<CompetitiveSignalConfidence, number> = { low: 0, medium: 1, high: 2 };
  const weakest = signals.reduce<CompetitiveSignalConfidence>(
    (current, signal) => (rank[signal.confidence] < rank[current] ? signal.confidence : current),
    'high',
  );
  return weakest === 'high' ? 'medium' : 'low';
}

function hypothesisHash(input: {
  ownedBrandId: string;
  competitorId: string;
  hypothesisType: StrategicHypothesisType;
  supportingSignalIds: string[];
}): string {
  const identity = {
    ownedBrandId: input.ownedBrandId,
    competitorId: input.competitorId,
    hypothesisType: input.hypothesisType,
    supportingSignalIds: [...input.supportingSignalIds].sort(),
    hypothesisEngineVersion: STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

function buildHypothesis(
  hypothesisType: StrategicHypothesisType,
  signals: CompetitiveSignal[],
  generatedAt: string,
): StrategicHypothesisCandidate | null {
  const supportingSignals = uniqueSignals(signals);
  const first = supportingSignals[0];
  if (!first) return null;
  if (
    supportingSignals.some(
      (signal) =>
        signal.ownedBrandId !== first.ownedBrandId ||
        signal.competitorId !== first.competitorId ||
        signal.ruleVersion !== SUPPORTED_HYPOTHESIS_SIGNAL_RULE_VERSION,
    )
  ) {
    return null;
  }

  const copy = STRATEGIC_HYPOTHESIS_CANONICAL_COPY[hypothesisType];
  const supportingSignalIds = supportingSignals.map((signal) => signal.id);
  const parsed = strategicHypothesisCandidateSchema.safeParse({
    hypothesisType,
    ownedBrandId: first.ownedBrandId,
    competitorId: first.competitorId,
    statement: copy.statement,
    rationale: copy.rationale,
    supportingSignalIds,
    confidence: hypothesisConfidence(supportingSignals),
    uncertainty: copy.uncertainty,
    generatedAt,
    hypothesisEngineVersion: STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
    generationProvenance: {
      method: 'deterministic_template',
      templateId: hypothesisType,
      sourceSignalRuleVersion: SUPPORTED_HYPOTHESIS_SIGNAL_RULE_VERSION,
    },
    hypothesisHash: hypothesisHash({
      ownedBrandId: first.ownedBrandId,
      competitorId: first.competitorId,
      hypothesisType,
      supportingSignalIds,
    }),
  });
  return parsed.success ? parsed.data : null;
}

function hypothesesForCompetitor(
  signals: CompetitiveSignal[],
  generatedAt: string,
): StrategicHypothesisCandidate[] {
  const shipping = signalsOfTypes(signals, SHIPPING_FRICTION_SIGNAL_TYPES);
  const perceivedRisk = signalsOfTypes(signals, PERCEIVED_RISK_SIGNAL_TYPES);
  const repeatPurchase = signalsOfTypes(signals, REPEAT_PURCHASE_SIGNAL_TYPES);
  const promotions = signalsOfTypes(signals, PROMOTIONAL_INCENTIVE_SIGNAL_TYPES);
  const drafts: Array<[StrategicHypothesisType, CompetitiveSignal[]]> = [
    ['competitor_may_reduce_shipping_friction', shipping],
    ['competitor_may_reduce_perceived_purchase_risk', perceivedRisk],
    ['competitor_may_emphasize_repeat_purchase_mechanics', repeatPurchase],
    ['competitor_may_emphasize_promotional_incentives', promotions],
  ];

  if (shipping.length > 0 && perceivedRisk.length > 0 && repeatPurchase.length > 0) {
    drafts.push([
      'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives',
      [...shipping, ...perceivedRisk, ...repeatPurchase],
    ]);
  }

  return drafts.flatMap(([hypothesisType, supportingSignals]) => {
    const hypothesis = buildHypothesis(hypothesisType, supportingSignals, generatedAt);
    return hypothesis ? [hypothesis] : [];
  });
}

/**
 * Interprets only persisted current signals supplied by the accepted current-signal service.
 */
export function generateStrategicHypotheses(
  input: GenerateStrategicHypothesesInput,
): StrategicHypothesisCandidate[] {
  const currentSignals = competitiveSignalSchema.array().parse(input.currentSignals).filter(
    (signal) => signal.ruleVersion === SUPPORTED_HYPOTHESIS_SIGNAL_RULE_VERSION,
  );
  const groups = new Map<string, CompetitiveSignal[]>();
  for (const signal of currentSignals) {
    const key = `${signal.ownedBrandId}:${signal.competitorId}`;
    const group = groups.get(key) ?? [];
    group.push(signal);
    groups.set(key, group);
  }

  return [...groups.values()]
    .flatMap((signals) => hypothesesForCompetitor(signals, input.generatedAt))
    .sort(
      (left, right) =>
        left.ownedBrandId.localeCompare(right.ownedBrandId) ||
        left.competitorId.localeCompare(right.competitorId) ||
        left.hypothesisType.localeCompare(right.hypothesisType) ||
        left.hypothesisHash.localeCompare(right.hypothesisHash),
    );
}

function unresolvedDependenciesForHistoricalHypothesis(input: {
  hypothesis: StrategicHypothesis;
  currentSignals: CompetitiveSignal[];
  currentSignalUnresolved: CurrentCompetitiveSignalUnresolved[];
  historicalSignalsById: Map<string, CompetitiveSignal>;
}): CurrentCompetitiveSignalLogicalIdentity[] | null {
  const groupedHistoricalDependencies = new Map<
    HypothesisSignalGroup,
    CurrentCompetitiveSignalLogicalIdentity[]
  >();
  for (const signalId of input.hypothesis.supportingSignalIds) {
    const signal = input.historicalSignalsById.get(signalId);
    if (!signal) return null;
    const group = signalGroupForType(signal.signalType);
    const identity = currentCompetitiveSignalLogicalIdentity(signal);
    if (!group || !identity) return null;
    const dependencies = groupedHistoricalDependencies.get(group) ?? [];
    dependencies.push(identity);
    groupedHistoricalDependencies.set(group, dependencies);
  }

  const activeGroups = new Set(
    input.currentSignals
      .filter(
        (signal) =>
          signal.ownedBrandId === input.hypothesis.ownedBrandId &&
          signal.competitorId === input.hypothesis.competitorId,
      )
      .flatMap((signal) => {
        const group = signalGroupForType(signal.signalType);
        return group ? [group] : [];
      }),
  );
  const unresolvedByIdentity = new Map(
    input.currentSignalUnresolved.map((unresolved) => [
      currentSignalIdentityKey(unresolved.logicalIdentity),
      unresolved.logicalIdentity,
    ]),
  );

  const unresolvedDependencies: CurrentCompetitiveSignalLogicalIdentity[] = [];
  for (const group of requiredGroups(input.hypothesis.hypothesisType)) {
    if (activeGroups.has(group)) continue;
    const dependencies = groupedHistoricalDependencies.get(group) ?? [];
    const unresolved = dependencies.flatMap((dependency) => {
      const current = unresolvedByIdentity.get(currentSignalIdentityKey(dependency));
      return current ? [current] : [];
    });
    if (unresolved.length === 0) return null;
    unresolvedDependencies.push(...unresolved);
  }

  return [...new Map(
    unresolvedDependencies.map((dependency) => [currentSignalIdentityKey(dependency), dependency]),
  ).values()].sort((left, right) =>
    currentSignalIdentityKey(left).localeCompare(currentSignalIdentityKey(right)),
  );
}

/**
 * Resolves a read-only current view from persisted current signals and immutable
 * hypothesis history. It never creates or alters historical intelligence.
 */
export function resolveCurrentStrategicHypotheses(
  input: ResolveCurrentStrategicHypothesesInput,
) {
  const currentSignals = competitiveSignalSchema.array().parse(input.currentSignals);
  const currentSignalUnresolved = currentCompetitiveSignalUnresolvedSchema
    .array()
    .parse(input.currentSignalUnresolved);
  const historicalHypotheses = strategicHypothesisSchema.array().parse(input.historicalHypotheses);
  const historicalSignals = competitiveSignalSchema.array().parse(input.historicalSignals);
  const candidates = generateStrategicHypotheses({
    currentSignals,
    generatedAt: input.generatedAt,
  });
  const historicalSignalsById = new Map(historicalSignals.map((signal) => [signal.id, signal]));
  const currentEngineHypotheses = historicalHypotheses.filter(
    (hypothesis) => hypothesis.hypothesisEngineVersion === STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
  );
  const persistedByHash = new Map(
    currentEngineHypotheses.map((hypothesis) => [hypothesis.hypothesisHash, hypothesis]),
  );
  const candidateIdentityKeys = new Set(
    candidates.map((candidate) => currentHypothesisIdentityKey(currentHypothesisIdentity(candidate))),
  );

  const hypotheses: StrategicHypothesis[] = [];
  const generationNeeded = [] as Array<{
    logicalIdentity: CurrentStrategicHypothesisLogicalIdentity;
    supportingSignalIds: string[];
    candidateHypothesisHash: string;
    hypothesisEngineVersion: typeof STRATEGIC_HYPOTHESIS_ENGINE_VERSION;
  }>;
  for (const candidate of candidates) {
    const persisted = persistedByHash.get(candidate.hypothesisHash);
    if (
      persisted &&
      persisted.ownedBrandId === candidate.ownedBrandId &&
      persisted.competitorId === candidate.competitorId &&
      persisted.hypothesisType === candidate.hypothesisType &&
      sameSignalIds(persisted.supportingSignalIds, candidate.supportingSignalIds)
    ) {
      hypotheses.push(persisted);
    } else {
      generationNeeded.push({
        logicalIdentity: currentHypothesisIdentity(candidate),
        supportingSignalIds: candidate.supportingSignalIds,
        candidateHypothesisHash: candidate.hypothesisHash,
        hypothesisEngineVersion: STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
      });
    }
  }

  const unresolvedByIdentity = new Map<
    string,
    {
      logicalIdentity: CurrentStrategicHypothesisLogicalIdentity;
      state: 'unknown';
      unresolvedSignalDependencies: CurrentCompetitiveSignalLogicalIdentity[];
    }
  >();
  for (const hypothesis of currentEngineHypotheses) {
    const logicalIdentity = currentHypothesisIdentity(hypothesis);
    const identityKey = currentHypothesisIdentityKey(logicalIdentity);
    if (candidateIdentityKeys.has(identityKey)) continue;
    const unresolvedDependencies = unresolvedDependenciesForHistoricalHypothesis({
      hypothesis,
      currentSignals,
      currentSignalUnresolved,
      historicalSignalsById,
    });
    if (!unresolvedDependencies) continue;
    const existing = unresolvedByIdentity.get(identityKey);
    unresolvedByIdentity.set(identityKey, {
      logicalIdentity,
      state: 'unknown',
      unresolvedSignalDependencies: [...new Map(
        [...(existing?.unresolvedSignalDependencies ?? []), ...unresolvedDependencies].map(
          (dependency) => [currentSignalIdentityKey(dependency), dependency],
        ),
      ).values()].sort((left, right) =>
        currentSignalIdentityKey(left).localeCompare(currentSignalIdentityKey(right)),
      ),
    });
  }

  return currentStrategicHypothesesProjectionSchema.parse({
    hypothesisEngineVersion: STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
    hypotheses: hypotheses.sort((left, right) => left.hypothesisHash.localeCompare(right.hypothesisHash)),
    unresolved: [...unresolvedByIdentity.values()].sort((left, right) =>
      currentHypothesisIdentityKey(left.logicalIdentity).localeCompare(
        currentHypothesisIdentityKey(right.logicalIdentity),
      ),
    ),
    generationNeeded: generationNeeded.sort((left, right) =>
      currentHypothesisIdentityKey(left.logicalIdentity).localeCompare(
        currentHypothesisIdentityKey(right.logicalIdentity),
      ),
    ),
  });
}
