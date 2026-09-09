import { z } from 'zod';
import {
  comparisonFactStateSchema,
  comparisonNumericDeltaSchema,
  comparisonProvenanceSchema,
  competitiveSignalConfidenceSchema,
  competitiveSignalDirectionSchema,
  competitiveSignalEvidenceRoleSchema,
  competitiveSignalSupportingValuesSchema,
  competitiveSignalTypeSchema,
  experimentMetricNameSchema,
  observedChangeTypeSchema,
  strategicHypothesisUncertaintyCategorySchema,
} from './contracts';

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const hypothesisRef = z.string().regex(/^h[1-9]\d*$/);

export const epistemicClassSchema = z.enum(['observed', 'derived', 'estimated', 'reported']);
export type EpistemicClass = z.infer<typeof epistemicClassSchema>;

export const contextComparisonSubjectValueSchema = z
  .object({
    subjectId: uuid,
    subjectRole: z.enum(['owned', 'competitor']),
    domain: z.string().min(1),
    state: comparisonFactStateSchema,
    value: z.record(z.string(), z.unknown()).nullable(),
    provenance: comparisonProvenanceSchema.nullable(),
  })
  .strict();

export const contextComparisonFactSchema = z
  .object({
    key: z.string().min(1),
    epistemicClass: epistemicClassSchema,
    owned: contextComparisonSubjectValueSchema,
    competitor: contextComparisonSubjectValueSchema,
    delta: comparisonNumericDeltaSchema.optional(),
  })
  .strict();

export const contextSignalEvidenceReferenceSchema = z
  .object({
    role: competitiveSignalEvidenceRoleSchema,
    sourceId: uuid,
    snapshotId: uuid,
    observationId: uuid.nullable(),
    priorSnapshotId: uuid.optional(),
    priorObservationId: uuid.optional(),
    observedChangeId: uuid.optional(),
    confidence: z.number().min(0).max(1),
    sourceUrl: z.string().url().optional(),
  })
  .strict();

export const contextSignalSchema = z
  .object({
    id: uuid,
    signalType: competitiveSignalTypeSchema,
    comparisonKey: z.string().min(1),
    competitorId: uuid,
    direction: competitiveSignalDirectionSchema.optional(),
    statement: z.string().min(1),
    supportingValues: competitiveSignalSupportingValuesSchema,
    confidence: competitiveSignalConfidenceSchema,
    epistemicClass: epistemicClassSchema,
    evidence: z.array(contextSignalEvidenceReferenceSchema).min(1),
  })
  .strict();

export const contextObservedChangeEvidenceSchema = z
  .object({
    sourceId: uuid,
    sourceUrl: z.string().url().optional(),
    currentSnapshotId: uuid,
    previousSnapshotId: uuid.nullable(),
    currentObservationId: uuid.nullable(),
    previousObservationId: uuid.nullable(),
  })
  .strict();

export const contextObservedChangeSchema = z
  .object({
    id: uuid,
    subjectId: uuid,
    subjectRole: z.enum(['owned', 'competitor']),
    factType: z.string().min(1),
    changeType: observedChangeTypeSchema,
    detectedAt: timestamp,
    beforeValue: z.record(z.string(), z.unknown()).nullable(),
    afterValue: z.record(z.string(), z.unknown()).nullable(),
    epistemicClass: epistemicClassSchema,
    evidence: contextObservedChangeEvidenceSchema,
  })
  .strict();

export const contextUntrustedSnippetSchema = z
  .object({
    snippetId: z.string().min(1),
    subjectId: uuid,
    subjectRole: z.enum(['owned', 'competitor']),
    sourceUrl: z.string().url(),
    sourceId: uuid,
    snapshotId: uuid,
    observationId: uuid.nullable(),
    field: z.string().min(1),
    text: z.string().min(1).max(500),
    epistemicClass: z.literal('reported'),
  })
  .strict();

export const contextSubjectSchema = z
  .object({
    id: uuid,
    domain: z.string().min(1),
    category: z.string().nullable().optional(),
  })
  .strict();

export const analysisObjectiveSchema = z.enum([
  'general_overview',
  'pricing_focus',
  'friction_reduction',
  'retention',
  'promotions',
]);
export type AnalysisObjective = z.infer<typeof analysisObjectiveSchema>;

export const intelligenceContextLimitsSchema = z
  .object({
    maxCompetitors: z.number().int().min(1).max(5),
    maxFacts: z.number().int().positive(),
    maxSignals: z.number().int().positive(),
    maxRecentChanges: z.number().int().nonnegative(),
    maxUntrustedSnippets: z.number().int().nonnegative(),
    maxSerializedBytes: z.number().int().positive(),
  })
  .strict();

export const DEFAULT_INTELLIGENCE_CONTEXT_LIMITS: z.infer<typeof intelligenceContextLimitsSchema> =
  {
    maxCompetitors: 5,
    maxFacts: 30,
    maxSignals: 30,
    maxRecentChanges: 10,
    maxUntrustedSnippets: 5,
    maxSerializedBytes: 65536, // 64 KB deterministic payload budget
  };

export const intelligenceContextSchema = z
  .object({
    contextVersion: z.literal('intelligence-context-v1'),
    brand: contextSubjectSchema,
    competitors: z
      .array(contextSubjectSchema)
      .min(1)
      .max(5)
      .refine(
        (competitors) => competitors.every((c, i) => i === 0 || competitors[i - 1]!.id < c.id),
        'Competitors must be unique and sorted by ID',
      ),
    facts: z.array(contextComparisonFactSchema),
    signals: z.array(contextSignalSchema),
    recentChanges: z.array(contextObservedChangeSchema),
    untrustedSnippets: z.array(contextUntrustedSnippetSchema),
    analysisObjective: analysisObjectiveSchema,
    generatedAt: timestamp,
    limits: intelligenceContextLimitsSchema,
  })
  .strict();

export type ContextComparisonSubjectValue = z.infer<typeof contextComparisonSubjectValueSchema>;
export type ContextComparisonFact = z.infer<typeof contextComparisonFactSchema>;
export type ContextSignalEvidenceReference = z.infer<typeof contextSignalEvidenceReferenceSchema>;
export type ContextSignal = z.infer<typeof contextSignalSchema>;
export type ContextObservedChange = z.infer<typeof contextObservedChangeSchema>;
export type ContextUntrustedSnippet = z.infer<typeof contextUntrustedSnippetSchema>;
export type ContextSubject = z.infer<typeof contextSubjectSchema>;
export type IntelligenceContext = z.infer<typeof intelligenceContextSchema>;

export const llmStrategicHypothesisThemeSchema = z.enum([
  'shipping_friction',
  'purchase_risk_reduction',
  'repeat_purchase_mechanics',
  'promotional_incentives',
  'pricing_strategy',
  'bundle_packaging',
]);
export type LlmStrategicHypothesisTheme = z.infer<typeof llmStrategicHypothesisThemeSchema>;

const groundedClaimMetadataShape = {
  subjectId: uuid,
  assertion: z.enum(['fact', 'absence']),
  claimedEpistemicClass: epistemicClassSchema,
};

export const groundedClaimReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('comparison'),
      comparisonKey: z.string().min(1),
      competitorId: uuid,
      ...groundedClaimMetadataShape,
    })
    .strict(),
  z
    .object({
      kind: z.literal('signal'),
      signalId: uuid,
      ...groundedClaimMetadataShape,
    })
    .strict(),
  z
    .object({
      kind: z.literal('observation'),
      observationId: uuid,
      ...groundedClaimMetadataShape,
    })
    .strict(),
  z
    .object({
      kind: z.literal('change'),
      changeId: uuid,
      ...groundedClaimMetadataShape,
    })
    .strict(),
  z
    .object({
      kind: z.literal('snippet'),
      snippetId: z.string().min(1),
      ...groundedClaimMetadataShape,
    })
    .strict(),
]);

export const groundedNumericClaimSchema = z
  .object({
    value: z.number().finite(),
    unit: z.enum(['usd', 'days', 'percent', 'percentage_points']),
    valueRole: z.enum(['owned', 'competitor', 'delta', 'previous', 'current']),
    direction: z
      .enum(['competitor_lower', 'competitor_higher', 'increase', 'decrease', 'equal'])
      .optional(),
    field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
    reference: groundedClaimReferenceSchema,
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.valueRole === 'delta' && claim.direction === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direction'],
        message: 'Delta claims must declare a direction',
      });
    }
    if (claim.reference.kind === 'change' && claim.field === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['field'],
        message: 'Change-backed numeric claims must declare a field',
      });
    }
  });

export const llmStrategicHypothesisOutputSchema = z
  .object({
    ref: hypothesisRef,
    competitorId: uuid,
    theme: llmStrategicHypothesisThemeSchema,
    statement: z.string().min(10).max(300),
    rationale: z.string().min(20).max(800),
    supportingSignalIds: z
      .array(uuid)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'Supporting signal IDs must be unique'),
    supportingComparisonKeys: z
      .array(z.string().min(1))
      .min(1)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        'Supporting comparison keys must be unique',
      ),
    confidence: z.enum(['medium', 'low']),
    uncertainty: z
      .object({
        category: strategicHypothesisUncertaintyCategorySchema,
        statement: z.string().min(10).max(400),
      })
      .strict(),
    assumptions: z.array(z.string().min(5).max(300)).min(1).max(10),
    epistemicClassDependencies: z.array(epistemicClassSchema).min(1),
    claimReferences: z.array(groundedClaimReferenceSchema).min(1).max(30),
    numericClaims: z.array(groundedNumericClaimSchema).max(20),
  })
  .strict();

export const llmRecommendedExperimentOutputSchema = z
  .object({
    competitorId: uuid,
    hypothesisRef,
    title: z.string().min(10).max(150),
    objective: z.string().min(15).max(400),
    hypothesisUnderTest: z.string().min(20).max(500),
    variableUnderTest: z.string().min(3).max(100),
    design: z
      .object({
        comparison: z.literal('control_vs_treatment'),
        variablePolicy: z.literal('single_variable'),
        controlDescription: z.string().min(10).max(400),
        treatmentDescription: z.string().min(10).max(400),
      })
      .strict(),
    primaryMetric: experimentMetricNameSchema,
    guardrailMetrics: z
      .array(experimentMetricNameSchema)
      .min(1)
      .max(5)
      .refine(
        (metrics) => new Set(metrics).size === metrics.length,
        'Guardrail metrics must be unique',
      ),
    implementationNotes: z.array(z.string().min(10).max(400)).min(2).max(8),
    caveat: z
      .object({
        category: z.enum([
          'shipping_margin_exposure',
          'policy_return_refund_exposure',
          'subscription_customer_fit_and_cancellation',
          'promotion_margin_exposure',
        ]),
        statement: z.string().min(10).max(400),
      })
      .strict(),
    claimReferences: z.array(groundedClaimReferenceSchema).min(1).max(30),
    numericClaims: z.array(groundedNumericClaimSchema).max(20),
  })
  .strict()
  .refine(
    (experiment) => !experiment.guardrailMetrics.includes(experiment.primaryMetric),
    'Guardrail metrics must not include the primary metric',
  );

export const llmExecutiveBriefingSchema = z
  .object({
    headline: z.string().min(10).max(150),
    strategicPostureSummary: z.string().min(30).max(600),
    keyTakeaway: z.string().min(20).max(400),
    supportingHypothesisRefs: z
      .array(hypothesisRef)
      .max(5)
      .refine(
        (refs) => new Set(refs).size === refs.length,
        'Supporting hypothesis refs must be unique',
      ),
    claimReferences: z.array(groundedClaimReferenceSchema).max(30),
    numericClaims: z.array(groundedNumericClaimSchema).max(20),
  })
  .strict()
  .refine(
    (briefing) =>
      briefing.supportingHypothesisRefs.length > 0 || briefing.claimReferences.length > 0,
    'Executive briefing must declare at least one source of support',
  );

export const llmIntelligenceSynthesisOutputSchema = z
  .object({
    executiveBriefing: llmExecutiveBriefingSchema,
    hypotheses: z.array(llmStrategicHypothesisOutputSchema).min(1).max(5),
    experiments: z.array(llmRecommendedExperimentOutputSchema).min(1).max(5),
  })
  .strict();

export type LlmStrategicHypothesisOutput = z.infer<typeof llmStrategicHypothesisOutputSchema>;
export type LlmRecommendedExperimentOutput = z.infer<typeof llmRecommendedExperimentOutputSchema>;
export type LlmExecutiveBriefing = z.infer<typeof llmExecutiveBriefingSchema>;
export type LlmIntelligenceSynthesisOutput = z.infer<typeof llmIntelligenceSynthesisOutputSchema>;
export type GroundedClaimReference = z.infer<typeof groundedClaimReferenceSchema>;
export type GroundedNumericClaim = z.infer<typeof groundedNumericClaimSchema>;
