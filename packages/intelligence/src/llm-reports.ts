import { createHash } from 'node:crypto';
import {
  competitiveReportV1CandidateSchema,
  competitiveReportV2LlmCandidateSchema,
  type CompetitiveReportProvenance,
  type CompetitiveReportV1Candidate,
  type CompetitiveReportV2LlmCandidate,
  type CompetitiveSignal,
  type PersistedLlmExecutiveBriefingPayload,
  type PersistedLlmExperimentPayload,
  type PersistedLlmHypothesisPayload,
} from '@rivallens/schemas';
import { COMPETITIVE_REPORT_SECTION_LIMIT } from './reports';

export const COMPETITIVE_REPORT_LLM_ENGINE_VERSION = 'competitive-report-v2-llm';

export type PersistedLlmReportHypothesis = PersistedLlmHypothesisPayload & { readonly id: string };
export type PersistedLlmReportExperiment = PersistedLlmExperimentPayload & {
  readonly id: string;
  readonly hypothesisId: string;
};
export type PersistedLlmReportBriefing = PersistedLlmExecutiveBriefingPayload & {
  readonly id: string;
  readonly supportingHypothesisIds: readonly string[];
};

export type ComposeLlmCompetitiveReportInput = {
  readonly baseReport: CompetitiveReportV1Candidate;
  readonly currentSignals: readonly CompetitiveSignal[];
  readonly hypotheses: readonly PersistedLlmReportHypothesis[];
  readonly experiments: readonly PersistedLlmReportExperiment[];
  readonly executiveBriefing: PersistedLlmReportBriefing;
  readonly generation: {
    readonly runId: string;
    readonly outcome: 'llm_success' | 'llm_partial';
    readonly contextHash: string;
    readonly promptVersion: string;
    readonly providerId: string;
    readonly modelId: string;
  };
  readonly generatedAt: string;
};

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort(compare);
}

function reportHash(input: ComposeLlmCompetitiveReportInput['generation']) {
  return `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        contextHash: input.contextHash,
        generationRunId: input.runId,
        modelId: input.modelId,
        promptVersion: input.promptVersion,
        providerId: input.providerId,
        reportEngineVersion: COMPETITIVE_REPORT_LLM_ENGINE_VERSION,
      }),
    )
    .digest('hex')}`;
}

const hypothesisTitles = {
  shipping_friction: 'Possible shipping-friction strategy',
  purchase_risk_reduction: 'Possible purchase-risk strategy',
  repeat_purchase_mechanics: 'Repeat-purchase emphasis',
  promotional_incentives: 'Promotional emphasis',
  pricing_strategy: 'Possible pricing strategy',
  bundle_packaging: 'Possible bundle or packaging strategy',
} as const;

export function composeLlmCompetitiveIntelligenceReport(
  raw: ComposeLlmCompetitiveReportInput,
): CompetitiveReportV2LlmCandidate {
  const baseReport = competitiveReportV1CandidateSchema.parse(raw.baseReport);
  if (raw.hypotheses.length === 0 || raw.experiments.length === 0) {
    throw new Error('An accepted LLM report requires hypotheses and experiments.');
  }
  const names = new Map(baseReport.competitors.map((competitor) => [competitor.id, competitor.name]));
  const signalsById = new Map(raw.currentSignals.map((signal) => [signal.id, signal]));
  const hypothesesById = new Map(raw.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const hypothesesByRef = new Map(raw.hypotheses.map((hypothesis) => [hypothesis.ref, hypothesis]));
  if (
    signalsById.size !== raw.currentSignals.length ||
    hypothesesById.size !== raw.hypotheses.length ||
    hypothesesByRef.size !== raw.hypotheses.length
  ) {
    throw new Error('LLM report inputs contain duplicate identities.');
  }

  function hypothesisProvenance(hypothesis: PersistedLlmReportHypothesis): CompetitiveReportProvenance {
    const signals = hypothesis.supportingSignalIds.map((signalId) => {
      const signal = signalsById.get(signalId);
      if (!signal || signal.competitorId !== hypothesis.competitorId) {
        throw new Error('LLM hypothesis references a signal outside the report scope.');
      }
      return { signalId, comparisonKey: signal.comparisonKey, evidence: signal.evidence };
    });
    return {
      signals: signals.sort((left, right) => compare(left.signalId, right.signalId)),
      hypotheses: [
        {
          hypothesisId: hypothesis.id,
          supportingSignalIds: uniqueSorted(hypothesis.supportingSignalIds),
        },
      ],
      experiments: [],
    };
  }

  const hypothesisItems = raw.hypotheses
    .map((hypothesis) => {
      const competitorName = names.get(hypothesis.competitorId);
      if (!competitorName) throw new Error('LLM hypothesis is outside the report competitor scope.');
      return {
        itemType: 'strategic_hypothesis' as const,
        title: hypothesisTitles[hypothesis.theme],
        statement: hypothesis.statement,
        competitorId: hypothesis.competitorId,
        competitorName,
        confidence: hypothesis.confidence,
        theme: hypothesis.theme,
        rationale: hypothesis.rationale,
        uncertainty: {
          category: hypothesis.uncertaintyCategory,
          statement: hypothesis.uncertaintyStatement,
        },
        assumptions: hypothesis.assumptions,
        epistemicClassDependencies: hypothesis.epistemicClassDependencies,
        claimReferences: hypothesis.claimReferences,
        numericClaims: hypothesis.numericClaims,
        provenance: hypothesisProvenance(hypothesis),
      };
    })
    .sort(
      (left, right) =>
        Number(left.confidence === 'low') - Number(right.confidence === 'low') ||
        compare(left.competitorId, right.competitorId) ||
        compare(left.statement, right.statement),
    );

  const experimentItems = raw.experiments
    .map((experiment) => {
      const hypothesis = hypothesesById.get(experiment.hypothesisId);
      const refHypothesis = hypothesesByRef.get(experiment.hypothesisRef);
      const competitorName = names.get(experiment.competitorId);
      if (
        !hypothesis ||
        hypothesis !== refHypothesis ||
        hypothesis.competitorId !== experiment.competitorId ||
        !competitorName
      ) {
        throw new Error('LLM experiment does not resolve to an in-scope persisted hypothesis.');
      }
      const provenance = hypothesisProvenance(hypothesis);
      return {
        itemType: 'recommended_experiment' as const,
        title: experiment.title,
        statement: experiment.objective,
        competitorId: experiment.competitorId,
        competitorName,
        hypothesisUnderTest: experiment.hypothesisUnderTest,
        variableUnderTest: experiment.variableUnderTest,
        design: experiment.design,
        primaryMetric: experiment.primaryMetric,
        guardrailMetrics: experiment.guardrailMetrics,
        implementationNotes: experiment.implementationNotes,
        caveat: { category: experiment.caveatCategory, statement: experiment.caveatStatement },
        claimReferences: experiment.claimReferences,
        numericClaims: experiment.numericClaims,
        provenance: {
          ...provenance,
          experiments: [
            { experimentId: experiment.id, sourceHypothesisIds: [hypothesis.id] },
          ],
        },
      };
    })
    .sort(
      (left, right) =>
        compare(left.competitorId, right.competitorId) || compare(left.title, right.title),
    );

  for (const hypothesisId of raw.executiveBriefing.supportingHypothesisIds) {
    if (!hypothesesById.has(hypothesisId)) {
      throw new Error('LLM briefing references a hypothesis outside the generation.');
    }
  }

  const sections = {
    yourAdvantages: baseReport.sections.yourAdvantages,
    competitorAdvantages: baseReport.sections.competitorAdvantages,
    appearsToBeWorking: hypothesisItems.slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
    whatToTestNext: experimentItems.slice(0, COMPETITIVE_REPORT_SECTION_LIMIT),
  };
  const sourceSignalIds = uniqueSorted([
    ...raw.currentSignals.map((signal) => signal.id),
    ...hypothesisItems.flatMap((item) => item.provenance.signals.map((signal) => signal.signalId)),
  ]);
  const sourceGaps =
    baseReport.completeness.comparisonUnknown.length > 0 ||
    baseReport.completeness.signals.unresolved.length > 0 ||
    baseReport.completeness.signals.generationNeeded.length > 0;
  const isPartial = raw.generation.outcome === 'llm_partial' || sourceGaps;
  const sectionStatus = (available: number, selected: number) => ({
    state: available > 0 ? ('supported' as const) : ('no_supported_finding' as const),
    available,
    omitted: available - selected,
  });

  return competitiveReportV2LlmCandidateSchema.parse({
    brandId: baseReport.brandId,
    generatedAt: raw.generatedAt,
    reportEngineVersion: COMPETITIVE_REPORT_LLM_ENGINE_VERSION,
    reportHash: reportHash(raw.generation),
    sourceStateHash: raw.generation.contextHash,
    competitors: baseReport.competitors,
    sourceIntelligence: {
      signalIds: sourceSignalIds,
      hypothesisIds: uniqueSorted(raw.hypotheses.map((hypothesis) => hypothesis.id)),
      experimentIds: uniqueSorted(raw.experiments.map((experiment) => experiment.id)),
      executiveBriefingId: raw.executiveBriefing.id,
    },
    generation: { result: raw.generation.outcome === 'llm_partial' ? 'llm_partial' : 'llm' },
    executiveBriefing: {
      headline: raw.executiveBriefing.headline,
      strategicPostureSummary: raw.executiveBriefing.strategicPostureSummary,
      keyTakeaway: raw.executiveBriefing.keyTakeaway,
      supportingHypothesisIds: uniqueSorted(raw.executiveBriefing.supportingHypothesisIds),
      claimReferences: raw.executiveBriefing.claimReferences,
      numericClaims: raw.executiveBriefing.numericClaims,
    },
    completeness: {
      state: isPartial ? 'partial' : 'complete',
      comparisonUnknown: baseReport.completeness.comparisonUnknown,
      signals: { unresolved: baseReport.completeness.signals.unresolved },
      sections: {
        yourAdvantages: sectionStatus(
          baseReport.completeness.sections.yourAdvantages.available,
          sections.yourAdvantages.length,
        ),
        competitorAdvantages: sectionStatus(
          baseReport.completeness.sections.competitorAdvantages.available,
          sections.competitorAdvantages.length,
        ),
        appearsToBeWorking: sectionStatus(hypothesisItems.length, sections.appearsToBeWorking.length),
        whatToTestNext: sectionStatus(experimentItems.length, sections.whatToTestNext.length),
      },
    },
    sections,
  });
}
