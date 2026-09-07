import { createHash } from 'node:crypto';
import {
  competitiveReportInputSchema,
  competitiveIntelligenceReportCandidateSchema,
  competitiveReportSectionNames,
  type CompetitiveReportInput,
  type CompetitiveIntelligenceReportCandidate,
  type CompetitiveReportProvenance,
  type CompetitiveReportFact,
  type CompetitiveReportHypothesis,
  type CompetitiveReportExperiment,
  type StrategicHypothesis,
  type RecommendedExperiment,
} from '@rivallens/schemas';
import {
  currentCompetitiveSignalLogicalIdentity,
  COMPETITIVE_SIGNAL_RULE_VERSION,
} from './signals';
import { STRATEGIC_HYPOTHESIS_ENGINE_VERSION } from './hypotheses';
import { RECOMMENDED_EXPERIMENT_ENGINE_VERSION } from './experiments';

export const COMPETITIVE_REPORT_ENGINE_VERSION = 'competitive-report-v1';
export const COMPETITIVE_REPORT_SECTION_LIMIT = 3;

// All input collections are sets for snapshot identity. Evidence timestamps remain significant.
function canonical(value: unknown, omitGenerationTime = false): string {
  function normalize(v: unknown): unknown {
    if (Array.isArray(v))
      return v.map(normalize).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([key]) => !omitGenerationTime || key !== 'generatedAt')
          .sort(([a], [b]) => compare(a, b))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    return v;
  }
  return JSON.stringify(normalize(value));
}
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}
export function competitiveReportHash(
  sourceStateHash: string,
  reportEngineVersion: string,
): string {
  return hash({ sourceStateHash, reportEngineVersion });
}
const sortedIds = (values: string[]) => [...new Set(values)].sort(compare);
const sorted = <T>(values: T[]) => [...values].sort((a, b) => compare(canonical(a), canonical(b)));

// Fixed presentation order, not an estimate of business importance.
const families = [
  {
    title: 'Free-shipping threshold',
    label: 'free-shipping threshold',
    owned: 'competitor_higher_free_shipping_threshold',
    competitor: 'competitor_lower_free_shipping_threshold',
    kind: 'numeric',
  },
  {
    title: 'Return window',
    label: 'return window',
    owned: 'competitor_shorter_return_window',
    competitor: 'competitor_longer_return_window',
    kind: 'numeric',
  },
  {
    title: 'Guarantee duration',
    label: 'guarantee duration',
    owned: 'competitor_shorter_guarantee_duration',
    competitor: 'competitor_longer_guarantee_duration',
    kind: 'numeric',
  },
  {
    title: 'Subscription availability',
    label: 'a subscription option',
    owned: 'owned_offers_subscription_competitor_does_not',
    competitor: 'competitor_offers_subscription_owned_does_not',
    kind: 'presence',
  },
  {
    title: 'Subscription discount',
    label: 'subscription discount',
    owned: 'competitor_lower_subscription_discount',
    competitor: 'competitor_higher_subscription_discount',
    kind: 'numeric',
  },
  {
    title: 'Explicit percentage discount',
    label: 'explicit percentage discount',
    owned: 'competitor_lower_explicit_percentage_discount',
    competitor: 'competitor_higher_explicit_percentage_discount',
    kind: 'numeric',
  },
  {
    title: 'Explicit discount',
    label: 'an explicit discount',
    owned: 'owned_offers_explicit_discount_competitor_does_not',
    competitor: 'competitor_offers_explicit_discount_owned_does_not',
    kind: 'presence',
  },
  {
    title: 'Bundle offer',
    label: 'a bundle offer',
    owned: 'owned_offers_bundle_competitor_does_not',
    competitor: 'competitor_offers_bundle_owned_does_not',
    kind: 'presence',
  },
  {
    title: 'BOGO offer',
    label: 'a buy-one-get-one offer',
    owned: 'owned_offers_bogo_competitor_does_not',
    competitor: 'competitor_offers_bogo_owned_does_not',
    kind: 'presence',
  },
] as const;
const hypothesisTitles: Record<StrategicHypothesis['hypothesisType'], string> = {
  competitor_may_reduce_shipping_friction: 'Possible shipping-friction strategy',
  competitor_may_reduce_perceived_purchase_risk: 'Possible purchase-risk strategy',
  competitor_may_emphasize_repeat_purchase_mechanics: 'Repeat-purchase emphasis',
  competitor_may_emphasize_promotional_incentives: 'Promotional emphasis',
  competitor_may_combine_purchase_friction_and_repeat_purchase_incentives:
    'Combined incentive emphasis',
};
const experimentOrder = [
  'free_shipping_threshold',
  'return_window_policy',
  'guarantee_policy',
  'subscription_availability',
  'subscription_discount',
  'explicit_discount',
  'bundle_offer',
  'bogo_offer',
];
const confidenceOrder = { high: 0, medium: 1, low: 2 };

/** Composes validated current projections; never detects, generates, or persists intelligence. */
export function composeCompetitiveIntelligenceReport(
  raw: CompetitiveReportInput,
): CompetitiveIntelligenceReportCandidate {
  const input = competitiveReportInputSchema.parse(raw);
  const {
    comparison,
    signalProjection,
    currentSignals,
    hypothesisProjection,
    experimentProjection,
  } = input;
  if (
    comparison.ownedSubject.subjectId !== comparison.brandId ||
    comparison.ownedSubject.subjectType !== 'brand'
  )
    throw new Error('Report comparison scope mismatch.');
  const competitors = comparison.competitors
    .map((c) => ({ id: c.subjectId, name: c.domain }))
    .sort((a, b) => compare(a.id, b.id));
  if (
    competitors.length < 1 ||
    competitors.length > 5 ||
    new Set(competitors.map((c) => c.id)).size !== competitors.length ||
    comparison.competitors.some(
      (c) => c.subjectType !== 'competitor' || c.subjectId === comparison.brandId,
    )
  )
    throw new Error('Invalid report competitor selection.');
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  function scoped(value: { ownedBrandId: string; competitorId: string }) {
    if (value.ownedBrandId !== comparison.brandId || !names.has(value.competitorId))
      throw new Error('Report intelligence scope mismatch.');
  }
  if (
    signalProjection.ruleVersion !== COMPETITIVE_SIGNAL_RULE_VERSION ||
    hypothesisProjection.hypothesisEngineVersion !== STRATEGIC_HYPOTHESIS_ENGINE_VERSION ||
    experimentProjection.experimentEngineVersion !== RECOMMENDED_EXPERIMENT_ENGINE_VERSION
  )
    throw new Error('Unsupported report input engine version.');
  for (const projection of [signalProjection, hypothesisProjection, experimentProjection]) {
    for (const dependency of projection.unresolved) scoped(dependency.logicalIdentity);
    if ('generationNeeded' in projection)
      for (const dependency of projection.generationNeeded) scoped(dependency.logicalIdentity);
  }
  for (const h of hypothesisProjection.unresolved)
    for (const dependency of h.unresolvedSignalDependencies) {
      scoped(dependency);
      if (dependency.competitorId !== h.logicalIdentity.competitorId)
        throw new Error('Unresolved dependency scope mismatch.');
    }
  for (const e of experimentProjection.unresolved) {
    scoped(e.unresolvedHypothesisDependency.logicalIdentity);
    for (const d of e.unresolvedHypothesisDependency.unresolvedSignalDependencies) scoped(d);
  }
  const signalsById = new Map(currentSignals.map((s) => [s.id, s]));
  const hypothesesById = new Map(hypothesisProjection.hypotheses.map((h) => [h.id, h]));
  if (
    signalsById.size !== currentSignals.length ||
    hypothesesById.size !== hypothesisProjection.hypotheses.length ||
    new Set(experimentProjection.experiments.map((e) => e.id)).size !==
      experimentProjection.experiments.length
  )
    throw new Error('Duplicate report intelligence IDs.');
  const candidatesByHash = new Map(signalProjection.signals.map((s) => [s.signalHash, s]));
  for (const s of signalProjection.signals) {
    scoped(s);
    // Validate the supplied chain, without deriving any new interpretation from comparison facts.
    if (
      !s.evidence.some((e) => e.role === 'owned') ||
      !s.evidence.some((e) => e.role === 'competitor') ||
      s.evidence.some((e) => {
        if (e.role !== 'owned' && e.role !== 'competitor') return true;
        const subjectId = e.role === 'owned' ? comparison.brandId : s.competitorId;
        return !comparison.facts.some((f) => {
          const value = f.valuesBySubjectId[subjectId],
            p = value?.provenance;
          return (
            value?.state !== 'unknown' &&
            p &&
            p.sourceId === e.sourceId &&
            p.snapshotId === e.snapshotId &&
            p.observationId === e.observationId &&
            p.priorSnapshotId === e.priorSnapshotId &&
            p.priorObservationId === e.priorObservationId &&
            p.confidence === e.confidence
          );
        });
      })
    )
      throw new Error('Report signal evidence does not match its current comparison.');
  }
  for (const s of currentSignals) {
    scoped(s);
    const candidate = candidatesByHash.get(s.signalHash);
    if (!candidate) throw new Error('Report signal is not current.');
    const persisted = Object.fromEntries(
      Object.entries(s).filter(([key]) => !['id', 'statement', 'generatedAt'].includes(key)),
    );
    const current = Object.fromEntries(
      Object.entries(candidate).filter(([key]) => !['statement', 'generatedAt'].includes(key)),
    );
    if (
      canonical(persisted) !== canonical(current) ||
      s.ruleVersion !== COMPETITIVE_SIGNAL_RULE_VERSION
    )
      throw new Error('Report signal lineage does not match its current candidate.');
  }
  function provenance(
    hypotheses: StrategicHypothesis[],
    experiments: RecommendedExperiment[],
    signalIds: string[],
  ): CompetitiveReportProvenance {
    const selected = sortedIds(signalIds).map((id) => {
      const s = signalsById.get(id);
      if (!s) throw new Error('Report lineage references a non-current signal.');
      return { signalId: s.id, comparisonKey: s.comparisonKey, evidence: sorted(s.evidence) };
    });
    return {
      signals: selected,
      hypotheses: hypotheses
        .map((h) => ({ hypothesisId: h.id, supportingSignalIds: h.supportingSignalIds }))
        .sort((a, b) => compare(a.hypothesisId, b.hypothesisId)),
      experiments: experiments.map((e) => ({
        experimentId: e.id,
        sourceHypothesisIds: e.sourceHypothesisIds,
      })),
    };
  }
  for (const h of hypothesisProjection.hypotheses) {
    scoped(h);
    if (
      h.hypothesisEngineVersion !== STRATEGIC_HYPOTHESIS_ENGINE_VERSION ||
      h.supportingSignalIds.some((id) => signalsById.get(id)?.competitorId !== h.competitorId)
    )
      throw new Error('Report hypothesis references non-current or mismatched signals.');
  }
  for (const h of hypothesisProjection.generationNeeded)
    if (
      h.supportingSignalIds.some(
        (id) => signalsById.get(id)?.competitorId !== h.logicalIdentity.competitorId,
      )
    )
      throw new Error('Hypothesis generation dependency is not current.');
  for (const e of experimentProjection.generationNeeded)
    if (
      e.sourceHypothesisIds.some(
        (id) => hypothesesById.get(id)?.competitorId !== e.logicalIdentity.competitorId,
      )
    )
      throw new Error('Experiment generation dependency is not current.');

  const facts: {
    yourAdvantages: CompetitiveReportFact[];
    competitorAdvantages: CompetitiveReportFact[];
  } = { yourAdvantages: [], competitorAdvantages: [] };
  for (const s of currentSignals) {
    const family = families.find((f) => f.owned === s.signalType || f.competitor === s.signalType);
    if (!family) continue;
    const owned = family.owned === s.signalType;
    const values = s.supportingValues,
      name = names.get(s.competitorId)!;
    let statement: string;
    if (family.kind === 'numeric') {
      if (typeof values.owned !== 'number' || typeof values.competitor !== 'number' || !values.unit)
        throw new Error('Numeric report fact lacks numeric supporting values.');
      const display = (value: number) =>
        values.unit === 'usd' ? `$${value}` : values.unit === 'days' ? `${value}-day` : `${value}%`;
      statement = `${name} offers a ${display(values.competitor)} ${family.label} versus your ${display(values.owned)} ${family.label}.`;
    } else {
      if (values.owned !== owned || values.competitor === owned)
        throw new Error('Presence report fact lacks explicit supporting values.');
      statement = owned
        ? `You offer ${family.label} while ${name} explicitly does not.`
        : `${name} offers ${family.label} while your brand explicitly does not.`;
    }
    facts[owned ? 'yourAdvantages' : 'competitorAdvantages'].push({
      itemType: 'competitive_fact',
      title: family.title,
      statement,
      competitorId: s.competitorId,
      competitorName: name,
      confidence: s.confidence,
      signalType: s.signalType,
      supportingValues: values,
      provenance: provenance([], [], [s.id]),
    });
  }
  const hypotheses: CompetitiveReportHypothesis[] = hypothesisProjection.hypotheses.map((h) => ({
    itemType: 'strategic_hypothesis',
    title: hypothesisTitles[h.hypothesisType],
    statement: h.statement,
    competitorId: h.competitorId,
    competitorName: names.get(h.competitorId)!,
    confidence: h.confidence,
    hypothesisType: h.hypothesisType,
    uncertainty: h.uncertainty,
    provenance: provenance([h], [], h.supportingSignalIds),
  }));
  const experiments: CompetitiveReportExperiment[] = experimentProjection.experiments.map((e) => {
    scoped(e);
    const parents = e.sourceHypothesisIds.map((id) => {
      const h = hypothesesById.get(id);
      if (!h || h.competitorId !== e.competitorId)
        throw new Error('Report experiment references a non-current hypothesis.');
      return h;
    });
    return {
      itemType: 'recommended_experiment',
      title: e.title,
      statement: e.objective,
      competitorId: e.competitorId,
      competitorName: names.get(e.competitorId)!,
      confidence: e.confidence.level,
      experiment: e,
      provenance: provenance(
        parents,
        [e],
        parents.flatMap((h) => h.supportingSignalIds),
      ),
    };
  });
  function order(
    a: CompetitiveReportFact | CompetitiveReportHypothesis | CompetitiveReportExperiment,
    b: typeof a,
  ) {
    const familyIndex = (value: typeof a) =>
      value.itemType === 'competitive_fact'
        ? families.findIndex(
            (f) => f.owned === value.signalType || f.competitor === value.signalType,
          )
        : value.itemType === 'strategic_hypothesis'
          ? Object.keys(hypothesisTitles).indexOf(value.hypothesisType)
          : experimentOrder.indexOf(value.experiment.experimentType);
    const sourceId = (value: typeof a) =>
      value.itemType === 'competitive_fact'
        ? value.provenance.signals[0]!.signalId
        : value.itemType === 'strategic_hypothesis'
          ? value.provenance.hypotheses[0]!.hypothesisId
          : value.experiment.id;
    return (
      confidenceOrder[a.confidence] - confidenceOrder[b.confidence] ||
      familyIndex(a) - familyIndex(b) ||
      compare(a.competitorName, b.competitorName) ||
      compare(a.competitorId, b.competitorId) ||
      compare(sourceId(a), sourceId(b))
    );
  }
  const available = { ...facts, appearsToBeWorking: hypotheses, whatToTestNext: experiments };
  const sections = {
    yourAdvantages: facts.yourAdvantages.sort(order).slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
    competitorAdvantages: facts.competitorAdvantages
      .sort(order)
      .slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
    appearsToBeWorking: hypotheses.sort(order).slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
    whatToTestNext: experiments.sort(order).slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
  };
  const persistedHashes = new Set(currentSignals.map((s) => s.signalHash));
  const signalGaps = signalProjection.signals
    .filter((s) => !persistedHashes.has(s.signalHash))
    .map((s) => {
      const logicalIdentity = currentCompetitiveSignalLogicalIdentity(s);
      if (!logicalIdentity) throw new Error('Current signal candidate has no logical identity.');
      return { logicalIdentity, candidateSignalHash: s.signalHash, ruleVersion: s.ruleVersion };
    });
  const comparisonUnknown = sorted(
    comparison.facts.flatMap((f) =>
      competitors.flatMap((c) => {
        const subjectIds = sortedIds(
          [comparison.brandId, c.id].filter(
            (id) => !f.valuesBySubjectId[id] || f.valuesBySubjectId[id]?.state === 'unknown',
          ),
        );
        return subjectIds.length ? [{ competitorId: c.id, comparisonKey: f.key, subjectIds }] : [];
      }),
    ),
  );
  const unresolved = [
    comparisonUnknown.length > 0 || signalProjection.unresolved.length > 0,
    hypothesisProjection.unresolved.length > 0,
    experimentProjection.unresolved.length > 0,
  ];
  const generation = [
    signalGaps.length > 0,
    hypothesisProjection.generationNeeded.length > 0,
    experimentProjection.generationNeeded.length > 0,
  ];
  function sectionStatus(section: (typeof competitiveReportSectionNames)[number]) {
    const depth = section === 'appearsToBeWorking' ? 2 : section === 'whatToTestNext' ? 3 : 1;
    const unknown = unresolved.slice(0, depth).some(Boolean),
      needed = generation.slice(0, depth).some(Boolean);
    const count = available[section].length;
    const state = count
      ? 'supported'
      : unknown && needed
        ? 'unresolved_and_generation_required'
        : unknown
          ? 'unresolved'
          : needed
            ? 'generation_required'
            : 'no_supported_finding';
    return { state, available: count, omitted: count - sections[section].length };
  }
  const anyItems = Object.values(sections).some((items) => items.length > 0);
  const sourceStateHash = hash(canonical({ ...input, generatedAt: undefined }, true));
  return competitiveIntelligenceReportCandidateSchema.parse({
    brandId: comparison.brandId,
    generatedAt: input.generatedAt,
    reportEngineVersion: COMPETITIVE_REPORT_ENGINE_VERSION,
    reportHash: competitiveReportHash(sourceStateHash, COMPETITIVE_REPORT_ENGINE_VERSION),
    sourceStateHash,
    competitors,
    sourceIntelligence: {
      signalIds: sortedIds(currentSignals.map((s) => s.id)),
      hypothesisIds: sortedIds(hypothesisProjection.hypotheses.map((h) => h.id)),
      experimentIds: sortedIds(experimentProjection.experiments.map((e) => e.id)),
    },
    completeness: {
      state: !anyItems
        ? 'insufficient'
        : unresolved.some(Boolean) || generation.some(Boolean)
          ? 'partial'
          : 'complete',
      comparisonUnknown,
      signals: {
        unresolved: sorted(signalProjection.unresolved),
        generationNeeded: sorted(signalGaps),
      },
      hypotheses: {
        unresolved: sorted(hypothesisProjection.unresolved),
        generationNeeded: sorted(hypothesisProjection.generationNeeded),
      },
      experiments: {
        unresolved: sorted(experimentProjection.unresolved),
        generationNeeded: sorted(experimentProjection.generationNeeded),
      },
      sections: Object.fromEntries(
        competitiveReportSectionNames.map((section) => [section, sectionStatus(section)]),
      ),
    },
    sections,
  });
}
