import { z } from 'zod';
import {
  brandComparisonResultSchema,
  competitiveSignalConfidenceSchema,
  competitiveSignalEvidenceReferenceSchema,
  competitiveSignalSchema,
  competitiveSignalSupportingValuesSchema,
  competitiveSignalTypeSchema,
  currentCompetitiveSignalLogicalIdentitySchema,
  currentCompetitiveSignalsProjectionSchema,
  currentCompetitiveSignalUnresolvedSchema,
  currentRecommendedExperimentsProjectionSchema,
  currentRecommendedExperimentUnresolvedSchema,
  currentRecommendedExperimentGenerationNeededSchema,
  currentStrategicHypothesesProjectionSchema,
  currentStrategicHypothesisUnresolvedSchema,
  currentStrategicHypothesisGenerationNeededSchema,
  experimentMetricNameSchema,
  recommendedExperimentSchema,
  strategicHypothesisTypeSchema,
  strategicHypothesisUncertaintySchema,
  STRATEGIC_HYPOTHESIS_CANONICAL_COPY,
} from './contracts';
import {
  epistemicClassSchema,
  groundedClaimReferenceSchema,
  groundedNumericClaimSchema,
  llmStrategicHypothesisThemeSchema,
} from './llm-intelligence';

const uuid = z.string().uuid();
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ids = z
  .array(uuid)
  .refine(
    (values) => values.every((id, index) => index === 0 || values[index - 1]! < id),
    'IDs must be unique and sorted',
  );
const text = z.string().min(1);

export const competitiveReportInputSchema = z
  .object({
    comparison: brandComparisonResultSchema,
    signalProjection: currentCompetitiveSignalsProjectionSchema,
    currentSignals: z.array(competitiveSignalSchema),
    hypothesisProjection: currentStrategicHypothesesProjectionSchema,
    experimentProjection: currentRecommendedExperimentsProjectionSchema,
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const competitiveReportProvenanceSchema = z
  .object({
    signals: z
      .array(
        z
          .object({
            signalId: uuid,
            comparisonKey: text,
            evidence: z.array(competitiveSignalEvidenceReferenceSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    hypotheses: z.array(
      z
        .object({ hypothesisId: uuid, supportingSignalIds: ids.refine((v) => v.length > 0) })
        .strict(),
    ),
    experiments: z.array(
      z
        .object({ experimentId: uuid, sourceHypothesisIds: ids.refine((v) => v.length > 0) })
        .strict(),
    ),
  })
  .strict();

const item = {
  title: text,
  statement: text,
  competitorId: uuid,
  competitorName: text,
  confidence: competitiveSignalConfidenceSchema,
  provenance: competitiveReportProvenanceSchema,
};
export const competitiveReportFactSchema = z
  .object({
    ...item,
    itemType: z.literal('competitive_fact'),
    signalType: competitiveSignalTypeSchema,
    supportingValues: competitiveSignalSupportingValuesSchema,
  })
  .strict();
export const competitiveReportHypothesisSchema = z
  .object({
    ...item,
    itemType: z.literal('strategic_hypothesis'),
    hypothesisType: strategicHypothesisTypeSchema,
    uncertainty: strategicHypothesisUncertaintySchema,
  })
  .strict();
export const competitiveReportExperimentSchema = z
  .object({
    ...item,
    itemType: z.literal('recommended_experiment'),
    experiment: recommendedExperimentSchema,
  })
  .strict();

export const competitiveReportSectionNames = [
  'yourAdvantages',
  'competitorAdvantages',
  'appearsToBeWorking',
  'whatToTestNext',
] as const;
const sectionStatus = z
  .object({
    state: z.enum([
      'supported',
      'no_supported_finding',
      'unresolved',
      'generation_required',
      'unresolved_and_generation_required',
    ]),
    available: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
  })
  .strict();
export const competitiveReportCompletenessSchema = z
  .object({
    state: z.enum(['complete', 'partial', 'insufficient']),
    comparisonUnknown: z.array(
      z
        .object({
          competitorId: uuid,
          comparisonKey: text,
          subjectIds: ids.refine((v) => v.length > 0),
        })
        .strict(),
    ),
    signals: z
      .object({
        unresolved: z.array(currentCompetitiveSignalUnresolvedSchema),
        generationNeeded: z.array(
          z
            .object({
              logicalIdentity: currentCompetitiveSignalLogicalIdentitySchema,
              candidateSignalHash: hash,
              ruleVersion: text,
            })
            .strict(),
        ),
      })
      .strict(),
    hypotheses: z
      .object({
        unresolved: z.array(currentStrategicHypothesisUnresolvedSchema),
        generationNeeded: z.array(currentStrategicHypothesisGenerationNeededSchema),
      })
      .strict(),
    experiments: z
      .object({
        unresolved: z.array(currentRecommendedExperimentUnresolvedSchema),
        generationNeeded: z.array(currentRecommendedExperimentGenerationNeededSchema),
      })
      .strict(),
    sections: z
      .object({
        yourAdvantages: sectionStatus,
        competitorAdvantages: sectionStatus,
        appearsToBeWorking: sectionStatus,
        whatToTestNext: sectionStatus,
      })
      .strict(),
  })
  .strict();

const reportShape = {
  brandId: uuid,
  generatedAt: z.string().datetime({ offset: true }),
  reportEngineVersion: z.literal('competitive-report-v1'),
  reportHash: hash,
  sourceStateHash: hash,
  competitors: z
    .array(z.object({ id: uuid, name: text }).strict())
    .min(1)
    .max(5)
    .refine(
      (v) => v.every((c, i) => i === 0 || v[i - 1]!.id < c.id),
      'Competitors must be unique and sorted',
    ),
  sourceIntelligence: z.object({ signalIds: ids, hypothesisIds: ids, experimentIds: ids }).strict(),
  completeness: competitiveReportCompletenessSchema,
  sections: z
    .object({
      yourAdvantages: z.array(competitiveReportFactSchema).max(3),
      competitorAdvantages: z.array(competitiveReportFactSchema).max(3),
      appearsToBeWorking: z.array(competitiveReportHypothesisSchema).max(3),
      whatToTestNext: z.array(competitiveReportExperimentSchema).max(3),
    })
    .strict(),
};

function validateReport(report: z.infer<z.ZodObject<typeof reportShape>>, ctx: z.RefinementCtx) {
  const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const anyItems = Object.values(report.sections).some((values) => values.length > 0);
  const hasGaps =
    report.completeness.comparisonUnknown.length > 0 ||
    [
      report.completeness.signals,
      report.completeness.hypotheses,
      report.completeness.experiments,
    ].some((layer) => layer.unresolved.length > 0 || layer.generationNeeded.length > 0);
  const expectedState = !anyItems ? 'insufficient' : hasGaps ? 'partial' : 'complete';
  if (report.completeness.state !== expectedState)
    invalid('Report completeness must reflect supported items and intelligence gaps');
  for (const section of competitiveReportSectionNames) {
    const values = report.sections[section],
      status = report.completeness.sections[section];
    if (status.available - values.length !== status.omitted)
      invalid('Section counts must match its selected items');
    for (const value of values) {
      if (
        !report.competitors.some(
          (c) => c.id === value.competitorId && c.name === value.competitorName,
        )
      )
        invalid('Item competitor must match report scope');
      const p = value.provenance;
      if (
        p.signals.some((s) => !report.sourceIntelligence.signalIds.includes(s.signalId)) ||
        p.hypotheses.some(
          (h) => !report.sourceIntelligence.hypothesisIds.includes(h.hypothesisId),
        ) ||
        p.experiments.some((e) => !report.sourceIntelligence.experimentIds.includes(e.experimentId))
      )
        invalid('Item provenance must reference source intelligence');
      if (
        p.hypotheses.some((h) =>
          h.supportingSignalIds.some((id) => !p.signals.some((s) => s.signalId === id)),
        ) ||
        p.experiments.some((e) =>
          e.sourceHypothesisIds.some((id) => !p.hypotheses.some((h) => h.hypothesisId === id)),
        )
      )
        invalid('Item provenance must retain complete parent lineage');
      if (
        value.itemType === 'competitive_fact' &&
        (p.signals.length !== 1 || p.hypotheses.length !== 0 || p.experiments.length !== 0)
      )
        invalid('Facts must reference exactly one signal');
      if (
        value.itemType === 'strategic_hypothesis' &&
        (p.hypotheses.length !== 1 || p.experiments.length !== 0)
      )
        invalid('Hypothesis items must reference exactly one hypothesis');
      if (
        value.itemType === 'strategic_hypothesis' &&
        report.reportEngineVersion === 'competitive-report-v1'
      ) {
        const copy = STRATEGIC_HYPOTHESIS_CANONICAL_COPY[value.hypothesisType];
        if (
          value.statement !== copy.statement ||
          value.uncertainty.category !== copy.uncertainty.category ||
          value.uncertainty.statement !== copy.uncertainty.statement
        )
          invalid('Report hypotheses must retain canonical uncertainty and statement');
      }
      if (
        value.itemType === 'recommended_experiment' &&
        (value.title !== value.experiment.title ||
          value.statement !== value.experiment.objective ||
          value.confidence !== value.experiment.confidence.level)
      )
        invalid('Report experiment summaries must match persisted experiment content');
      if (
        value.itemType === 'recommended_experiment' &&
        (p.experiments.length !== 1 ||
          p.experiments[0]?.experimentId !== value.experiment.id ||
          value.experiment.ownedBrandId !== report.brandId ||
          value.experiment.competitorId !== value.competitorId ||
          JSON.stringify(p.experiments[0]?.sourceHypothesisIds) !==
            JSON.stringify(value.experiment.sourceHypothesisIds))
      )
        invalid('Experiment item must retain exact persisted lineage and scope');
    }
  }
}
export const competitiveReportV1CandidateSchema = z
  .object(reportShape)
  .strict()
  .superRefine(validateReport);
export const competitiveReportV1Schema = z
  .object({ ...reportShape, id: uuid })
  .strict()
  .superRefine(validateReport);

const llmReportHypothesisSchema = z
  .object({
    itemType: z.literal('strategic_hypothesis'),
    title: text,
    statement: text,
    competitorId: uuid,
    competitorName: text,
    confidence: z.enum(['medium', 'low']),
    theme: llmStrategicHypothesisThemeSchema,
    rationale: text,
    uncertainty: strategicHypothesisUncertaintySchema,
    assumptions: z.array(text).min(1),
    epistemicClassDependencies: z.array(epistemicClassSchema).min(1),
    claimReferences: z.array(groundedClaimReferenceSchema).min(1),
    numericClaims: z.array(groundedNumericClaimSchema),
    provenance: competitiveReportProvenanceSchema,
  })
  .strict();

const llmReportExperimentSchema = z
  .object({
    itemType: z.literal('recommended_experiment'),
    title: text,
    statement: text,
    competitorId: uuid,
    competitorName: text,
    hypothesisUnderTest: text,
    variableUnderTest: text,
    design: z
      .object({
        comparison: z.literal('control_vs_treatment'),
        variablePolicy: z.literal('single_variable'),
        controlDescription: text,
        treatmentDescription: text,
      })
      .strict(),
    primaryMetric: experimentMetricNameSchema,
    guardrailMetrics: z.array(experimentMetricNameSchema).min(1),
    implementationNotes: z.array(text).min(1),
    caveat: z
      .object({
        category: z.enum([
          'shipping_margin_exposure',
          'policy_return_refund_exposure',
          'subscription_customer_fit_and_cancellation',
          'promotion_margin_exposure',
        ]),
        statement: text,
      })
      .strict(),
    claimReferences: z.array(groundedClaimReferenceSchema).min(1),
    numericClaims: z.array(groundedNumericClaimSchema),
    provenance: competitiveReportProvenanceSchema,
  })
  .strict();

const llmReportBriefingSchema = z
  .object({
    headline: text,
    strategicPostureSummary: text,
    keyTakeaway: text,
    supportingHypothesisIds: ids,
    claimReferences: z.array(groundedClaimReferenceSchema),
    numericClaims: z.array(groundedNumericClaimSchema),
  })
  .strict();

const llmSectionStatusSchema = z
  .object({
    state: z.enum(['supported', 'no_supported_finding', 'unresolved']),
    available: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
  })
  .strict();

const llmReportShape = {
  brandId: uuid,
  generatedAt: z.string().datetime({ offset: true }),
  reportEngineVersion: z.literal('competitive-report-v2-llm'),
  reportHash: hash,
  sourceStateHash: hash,
  competitors: reportShape.competitors,
  sourceIntelligence: z
    .object({
      signalIds: ids,
      hypothesisIds: ids.refine((values) => values.length > 0),
      experimentIds: ids.refine((values) => values.length > 0),
      executiveBriefingId: uuid,
    })
    .strict(),
  generation: z.object({ result: z.enum(['llm', 'llm_partial']) }).strict(),
  executiveBriefing: llmReportBriefingSchema,
  completeness: z
    .object({
      state: z.enum(['complete', 'partial']),
      comparisonUnknown: competitiveReportCompletenessSchema.shape.comparisonUnknown,
      signals: z.object({ unresolved: z.array(currentCompetitiveSignalUnresolvedSchema) }).strict(),
      sections: z
        .object({
          yourAdvantages: llmSectionStatusSchema,
          competitorAdvantages: llmSectionStatusSchema,
          appearsToBeWorking: llmSectionStatusSchema,
          whatToTestNext: llmSectionStatusSchema,
        })
        .strict(),
    })
    .strict(),
  sections: z
    .object({
      yourAdvantages: z.array(competitiveReportFactSchema).max(3),
      competitorAdvantages: z.array(competitiveReportFactSchema).max(3),
      appearsToBeWorking: z.array(llmReportHypothesisSchema).max(3),
      whatToTestNext: z.array(llmReportExperimentSchema).max(3),
    })
    .strict(),
};

function validateLlmReport(
  report: z.infer<z.ZodObject<typeof llmReportShape>>,
  ctx: z.RefinementCtx,
) {
  const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (report.generation.result === 'llm_partial' && report.completeness.state !== 'partial') {
    invalid('A partial LLM generation must produce a partial report');
  }
  for (const section of competitiveReportSectionNames) {
    const values = report.sections[section];
    const status = report.completeness.sections[section];
    if (status.available - values.length !== status.omitted) {
      invalid('Section counts must match its selected items');
    }
    for (const value of values) {
      if (!report.competitors.some((competitor) => competitor.id === value.competitorId && competitor.name === value.competitorName)) {
        invalid('Item competitor must match report scope');
      }
      const provenance = value.provenance;
      if (
        provenance.signals.some((item) => !report.sourceIntelligence.signalIds.includes(item.signalId)) ||
        provenance.hypotheses.some((item) => !report.sourceIntelligence.hypothesisIds.includes(item.hypothesisId)) ||
        provenance.experiments.some((item) => !report.sourceIntelligence.experimentIds.includes(item.experimentId))
      ) {
        invalid('Item provenance must reference source intelligence');
      }
      if (
        provenance.hypotheses.some((item) => item.supportingSignalIds.some((id) => !provenance.signals.some((signal) => signal.signalId === id))) ||
        provenance.experiments.some((item) => item.sourceHypothesisIds.some((id) => !provenance.hypotheses.some((hypothesis) => hypothesis.hypothesisId === id)))
      ) {
        invalid('Item provenance must retain complete parent lineage');
      }
      if (value.itemType === 'competitive_fact' && (provenance.signals.length !== 1 || provenance.hypotheses.length !== 0 || provenance.experiments.length !== 0)) {
        invalid('Facts must reference exactly one signal');
      }
      if (value.itemType === 'strategic_hypothesis' && (provenance.hypotheses.length !== 1 || provenance.experiments.length !== 0)) {
        invalid('Hypothesis items must reference exactly one hypothesis');
      }
      if (value.itemType === 'recommended_experiment' && provenance.experiments.length !== 1) {
        invalid('Experiment items must reference exactly one experiment');
      }
    }
  }
  if (report.executiveBriefing.supportingHypothesisIds.some((id) => !report.sourceIntelligence.hypothesisIds.includes(id))) {
    invalid('Executive briefing must reference report source hypotheses');
  }
}

export const competitiveReportV2LlmCandidateSchema = z
  .object(llmReportShape)
  .strict()
  .superRefine(validateLlmReport);
export const competitiveReportV2LlmSchema = z
  .object({ ...llmReportShape, id: uuid })
  .strict()
  .superRefine(validateLlmReport);

export const competitiveReportAnyCandidateSchema = z.union([
  competitiveReportV1CandidateSchema,
  competitiveReportV2LlmCandidateSchema,
]);
export const competitiveReportAnySchema = z.union([
  competitiveReportV1Schema,
  competitiveReportV2LlmSchema,
]);
// Existing deterministic names remain v1-specific so Phase 6 does not broaden the contract of
// deterministic composers and loaders accidentally. Version-aware paths use the `Any` schemas.
export const competitiveIntelligenceReportCandidateSchema = competitiveReportV1CandidateSchema;
export const competitiveIntelligenceReportSchema = competitiveReportV1Schema;
export type CompetitiveReportInput = z.infer<typeof competitiveReportInputSchema>;
export type CompetitiveReportV1Candidate = z.infer<typeof competitiveReportV1CandidateSchema>;
export type CompetitiveReportV2LlmCandidate = z.infer<typeof competitiveReportV2LlmCandidateSchema>;
export type CompetitiveReportAnyCandidate = z.infer<typeof competitiveReportAnyCandidateSchema>;
export type CompetitiveReportAny = z.infer<typeof competitiveReportAnySchema>;
export type CompetitiveIntelligenceReportCandidate = z.infer<
  typeof competitiveIntelligenceReportCandidateSchema
>;
export type CompetitiveIntelligenceReport = z.infer<typeof competitiveIntelligenceReportSchema>;
export type CompetitiveReportProvenance = z.infer<typeof competitiveReportProvenanceSchema>;
export type CompetitiveReportFact = z.infer<typeof competitiveReportFactSchema>;
export type CompetitiveReportHypothesis = z.infer<typeof competitiveReportHypothesisSchema>;
export type CompetitiveReportExperiment = z.infer<typeof competitiveReportExperimentSchema>;
export type CompetitiveReportLlmHypothesis = z.infer<typeof llmReportHypothesisSchema>;
export type CompetitiveReportLlmExperiment = z.infer<typeof llmReportExperimentSchema>;
