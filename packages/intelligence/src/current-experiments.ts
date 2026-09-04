import { isDeepStrictEqual } from 'node:util';
import {
  competitiveSignalSchema,
  currentRecommendedExperimentsProjectionSchema,
  currentStrategicHypothesesProjectionSchema,
  recommendedExperimentSchema,
  type CompetitiveSignal,
  type CurrentRecommendedExperimentLogicalIdentity,
  type CurrentRecommendedExperimentUnresolved,
  type CurrentRecommendedExperimentsProjection,
  type CurrentStrategicHypothesesProjection,
  type CurrentStrategicHypothesisUnresolved,
  type RecommendedExperiment,
  type RecommendedExperimentType,
} from '@rivallens/schemas';
import {
  generateRecommendedExperiments,
  RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
} from './experiments';

export type ResolveCurrentRecommendedExperimentsInput = {
  currentHypotheses: CurrentStrategicHypothesesProjection;
  supportingSignals: CompetitiveSignal[];
  historicalExperiments: RecommendedExperiment[];
  generatedAt: string;
};

function identityKey(identity: CurrentRecommendedExperimentLogicalIdentity): string {
  return [
    identity.ownedBrandId,
    identity.competitorId,
    identity.experimentType,
    identity.hypothesisType,
  ].join(':');
}

// These are dependency identities supplied by the hypothesis projection, never raw evidence.
function unresolvedExperimentTypes(
  hypothesis: CurrentStrategicHypothesisUnresolved,
): RecommendedExperimentType[] {
  const { ownedBrandId, competitorId, hypothesisType } = hypothesis.logicalIdentity;
  return hypothesis.unresolvedSignalDependencies.flatMap((dependency) => {
    if (dependency.ownedBrandId !== ownedBrandId || dependency.competitorId !== competitorId) {
      throw new Error('Unresolved hypothesis dependency has mismatched experiment scope.');
    }
    const { comparisonKey, signalFamily } = dependency;
    if (signalFamily === 'relative_numeric') {
      if (
        hypothesisType === 'competitor_may_reduce_shipping_friction' &&
        comparisonKey === 'offer.free_shipping_threshold'
      )
        return ['free_shipping_threshold'];
      if (hypothesisType === 'competitor_may_reduce_perceived_purchase_risk') {
        if (comparisonKey === 'policy.return_window') return ['return_window_policy'];
        if (comparisonKey === 'policy.guarantee_duration') return ['guarantee_policy'];
      }
      if (
        hypothesisType === 'competitor_may_emphasize_repeat_purchase_mechanics' &&
        comparisonKey === 'subscription.discount'
      )
        return ['subscription_discount'];
      if (
        hypothesisType === 'competitor_may_emphasize_promotional_incentives' &&
        comparisonKey === 'offer.discount.explicit_percentage'
      )
        return ['explicit_discount'];
    }
    if (signalFamily === 'presence_difference') {
      if (
        hypothesisType === 'competitor_may_emphasize_repeat_purchase_mechanics' &&
        comparisonKey === 'subscription.available'
      )
        return ['subscription_availability'];
      if (hypothesisType === 'competitor_may_emphasize_promotional_incentives') {
        if (comparisonKey === 'offer.bundle') return ['bundle_offer'];
        if (comparisonKey === 'offer.buy_x_get_y') return ['bogo_offer'];
        const discount = /^offer\.discount:(percentage|fixed):(\d+(?:\.\d+)?)$/.exec(comparisonKey);
        if (discount && Number.isFinite(Number(discount[2]))) return ['explicit_discount'];
      }
    }
    return [];
  });
}

/** Logical identities group lifecycle states; only exact lineage/configuration hashes select history. */
export function resolveCurrentRecommendedExperiments(
  input: ResolveCurrentRecommendedExperimentsInput,
): CurrentRecommendedExperimentsProjection {
  const current = currentStrategicHypothesesProjectionSchema.parse(input.currentHypotheses);
  const signals = competitiveSignalSchema.array().parse(input.supportingSignals);
  const history = recommendedExperimentSchema.array().parse(input.historicalExperiments);
  const candidates = generateRecommendedExperiments({
    currentHypotheses: current.hypotheses,
    supportingSignals: signals,
    generatedAt: input.generatedAt,
  });
  const hypothesesById = new Map(
    current.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]),
  );
  const persistedByHash = new Map(
    history
      .filter(
        (experiment) =>
          experiment.experimentEngineVersion === RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
      )
      .map((experiment) => [experiment.experimentHash, experiment]),
  );
  const experiments: RecommendedExperiment[] = [];
  const generationNeeded: CurrentRecommendedExperimentsProjection['generationNeeded'] = [];
  for (const candidate of candidates) {
    const persisted = persistedByHash.get(candidate.experimentHash);
    if (
      persisted &&
      persisted.ownedBrandId === candidate.ownedBrandId &&
      persisted.competitorId === candidate.competitorId &&
      persisted.experimentType === candidate.experimentType &&
      isDeepStrictEqual(persisted.sourceHypothesisIds, candidate.sourceHypothesisIds) &&
      isDeepStrictEqual(persisted.control, candidate.control) &&
      isDeepStrictEqual(persisted.treatment, candidate.treatment) &&
      isDeepStrictEqual(persisted.generationProvenance, candidate.generationProvenance)
    ) {
      experiments.push(persisted);
    } else {
      const hypothesis = hypothesesById.get(candidate.sourceHypothesisIds[0]!)!;
      generationNeeded.push({
        logicalIdentity: {
          ownedBrandId: candidate.ownedBrandId,
          competitorId: candidate.competitorId,
          experimentType: candidate.experimentType,
          hypothesisType:
            hypothesis.hypothesisType as CurrentRecommendedExperimentLogicalIdentity['hypothesisType'],
        },
        sourceHypothesisIds: candidate.sourceHypothesisIds,
        candidateExperimentHash: candidate.experimentHash,
        experimentEngineVersion: RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
      });
    }
  }

  const unresolved = new Map<string, CurrentRecommendedExperimentUnresolved>();
  for (const dependency of current.unresolved) {
    if (
      dependency.logicalIdentity.hypothesisType ===
      'competitor_may_combine_purchase_friction_and_repeat_purchase_incentives'
    )
      continue;
    for (const experimentType of unresolvedExperimentTypes(dependency)) {
      const logicalIdentity = {
        ...dependency.logicalIdentity,
        hypothesisType: dependency.logicalIdentity.hypothesisType,
        experimentType,
      };
      unresolved.set(identityKey(logicalIdentity), {
        logicalIdentity,
        state: 'unknown',
        reason: 'hypothesis_unresolved',
        unresolvedHypothesisDependency: dependency,
      });
    }
  }
  return currentRecommendedExperimentsProjectionSchema.parse({
    experimentEngineVersion: RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
    experiments: experiments.sort((left, right) =>
      left.experimentHash.localeCompare(right.experimentHash),
    ),
    unresolved: [...unresolved.values()].sort((left, right) =>
      identityKey(left.logicalIdentity).localeCompare(identityKey(right.logicalIdentity)),
    ),
    generationNeeded: generationNeeded.sort((left, right) =>
      identityKey(left.logicalIdentity).localeCompare(identityKey(right.logicalIdentity)),
    ),
  });
}
