import { z } from 'zod';
import {
  experimentMetricNameSchema,
  strategicHypothesisUncertaintyCategorySchema,
} from './contracts';
import {
  analysisObjectiveSchema,
  epistemicClassSchema,
  groundedClaimReferenceSchema,
  groundedNumericClaimSchema,
  llmStrategicHypothesisThemeSchema,
} from './llm-intelligence';

const uuid = z.string().uuid();
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const hypothesisRef = z.string().regex(/^h[1-9]\d*$/);
const nonBlank = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, 'Must not be blank');
const nonNegativeInteger = z.number().int().nonnegative();

export const LLM_STRATEGIC_HYPOTHESIS_ENGINE_VERSION = 'strategic-hypotheses-v2-llm';
export const LLM_RECOMMENDED_EXPERIMENT_ENGINE_VERSION = 'recommended-experiments-v2-llm';
export const MAX_PERSISTED_GENERATION_ATTEMPTS = 2;

// Terminal persisted outcome of one generation run. Derived at the persistence boundary from
// re-validation against the stored frozen context -- never copied from an orchestration claim.
export const intelligenceGenerationOutcomeSchema = z.enum([
  'llm_success',
  'llm_partial',
  'llm_rejected',
  'deterministic_fallback',
]);
export type IntelligenceGenerationOutcome = z.infer<typeof intelligenceGenerationOutcomeSchema>;

export const intelligenceFallbackReasonSchema = z.enum([
  'CONTEXT_HASH_MISMATCH',
  'INVALID_CONTEXT',
  'MALFORMED_OUTPUT',
  'VALIDATION_REPAIR_EXHAUSTED',
  'PROVIDER_RETRY_EXHAUSTED',
  'PROVIDER_NON_RETRYABLE_FAILURE',
]);
export type IntelligenceFallbackReason = z.infer<typeof intelligenceFallbackReasonSchema>;

export const intelligenceProviderFailureCodeSchema = z.enum([
  'timeout',
  'rate_limit',
  'provider_unavailable',
  'authentication_configuration',
  'invalid_request',
  'provider_exception',
]);

export const intelligenceValidationStatusSchema = z.enum(['passed', 'partial', 'failed']);

export const intelligenceModelParametersRecordSchema = z
  .object({
    temperature: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

export const intelligenceProviderFailureMetadataRecordSchema = z
  .object({
    httpStatus: z.number().int().optional(),
    providerRequestId: z.string().optional(),
    providerErrorCode: z.string().optional(),
    fieldViolationPaths: z.array(z.string()).optional(),
  })
  .strict();

// Nullable telemetry is semantically real: unavailable token counts or unknown cost stay null.
export const intelligenceAttemptTelemetryRecordSchema = z
  .object({
    providerId: nonBlank,
    modelId: nonBlank,
    latencyMs: z.number().nonnegative(),
    inputTokens: nonNegativeInteger.nullable(),
    outputTokens: nonNegativeInteger.nullable(),
    totalTokens: nonNegativeInteger.nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    rawResponseId: z.string().nullable(),
    finishReason: z.string().nullable(),
  })
  .strict();

export const intelligenceGenerationAttemptInputSchema = z
  .object({
    attemptNumber: z.union([z.literal(1), z.literal(2)]),
    kind: z.enum(['initial', 'retry']),
    retryReason: z.enum(['transport', 'validation_repair']).optional(),
    promptVersion: nonBlank,
    telemetry: intelligenceAttemptTelemetryRecordSchema.optional(),
    providerFailure: intelligenceProviderFailureCodeSchema.optional(),
    providerFailureMetadata: intelligenceProviderFailureMetadataRecordSchema.optional(),
    // Untrusted provider output, captured verbatim for audit only. Absent when the provider
    // produced none or it was not captured; never fabricated.
    rawOutput: z.object({ value: z.unknown() }).strict().optional(),
  })
  .strict();
export type IntelligenceGenerationAttemptInput = z.infer<
  typeof intelligenceGenerationAttemptInputSchema
>;

// The persistence boundary envelope. It deliberately has no field for a validation result or
// accepted output: acceptance is recomputed from `context` + attempt raw output at the boundary.
export const persistIntelligenceGenerationInputSchema = z
  .object({
    generationRunId: uuid,
    context: z.unknown(),
    contextHash: hash,
    promptVersion: nonBlank,
    providerId: nonBlank,
    modelId: nonBlank,
    parameters: intelligenceModelParametersRecordSchema,
    attempts: z
      .array(intelligenceGenerationAttemptInputSchema)
      .min(1)
      .max(MAX_PERSISTED_GENERATION_ATTEMPTS),
    generationOutcome: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('llm_candidate') }).strict(),
      z
        .object({
          kind: z.literal('deterministic_fallback'),
          fallbackReason: intelligenceFallbackReasonSchema,
        })
        .strict(),
    ]),
  })
  .strict();
export type PersistIntelligenceGenerationInput = z.infer<
  typeof persistIntelligenceGenerationInputSchema
>;

const validationErrorRecordSchema = z
  .object({ code: nonBlank, path: z.array(z.union([z.string(), z.number()])) })
  .strict();
const itemValidationRecordSchema = z
  .object({
    index: nonNegativeInteger,
    status: z.enum(['accepted', 'rejected']),
    errorCodes: z.array(nonBlank),
  })
  .strict();

// Audit-only validation summary. Validator messages are omitted because schema issue messages
// can echo untrusted model text; they are reproducible from the stored context + raw output.
export const intelligenceValidationSummarySchema = z
  .object({
    status: intelligenceValidationStatusSchema,
    errors: z.array(validationErrorRecordSchema),
    hypotheses: z.array(itemValidationRecordSchema),
    experiments: z.array(itemValidationRecordSchema),
    executiveBriefing: z
      .object({ status: z.enum(['accepted', 'rejected']), errorCodes: z.array(nonBlank) })
      .strict(),
  })
  .strict();
export type IntelligenceValidationSummary = z.infer<typeof intelligenceValidationSummarySchema>;

export const llmGenerationProvenanceSchema = z
  .object({
    method: z.literal('llm_synthesized'),
    generationRunId: uuid,
    providerId: nonBlank,
    modelId: nonBlank,
    promptVersion: nonBlank,
    intelligenceContextHash: hash,
    validatorContractVersion: nonBlank,
  })
  .strict();
export type LlmGenerationProvenance = z.infer<typeof llmGenerationProvenanceSchema>;

const uniqueStrings = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(item)
    .refine((values) => new Set(values).size === values.length, 'Values must be unique');

export const persistedGenerationAttemptPayloadSchema = z
  .object({
    attemptNumber: z.union([z.literal(1), z.literal(2)]),
    kind: z.enum(['initial', 'retry']),
    retryReason: z.enum(['transport', 'validation_repair']).nullable(),
    promptVersion: nonBlank,
    latencyMs: nonNegativeInteger.nullable(),
    inputTokens: nonNegativeInteger.nullable(),
    outputTokens: nonNegativeInteger.nullable(),
    totalTokens: nonNegativeInteger.nullable(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    rawResponseId: z.string().nullable(),
    finishReason: z.string().nullable(),
    providerFailure: intelligenceProviderFailureCodeSchema.nullable(),
    providerFailureMetadata: intelligenceProviderFailureMetadataRecordSchema.nullable(),
    rawOutputCaptured: z.boolean(),
    rawOutput: z.unknown(),
    validationStatus: intelligenceValidationStatusSchema.nullable(),
    validationErrorCodes: z.array(nonBlank),
  })
  .strict();

export const persistedLlmHypothesisPayloadSchema = z
  .object({
    ref: hypothesisRef,
    competitorId: uuid,
    theme: llmStrategicHypothesisThemeSchema,
    statement: nonBlank,
    rationale: nonBlank,
    confidence: z.enum(['medium', 'low']),
    uncertaintyCategory: strategicHypothesisUncertaintyCategorySchema,
    uncertaintyStatement: nonBlank,
    assumptions: z.array(nonBlank).min(1),
    epistemicClassDependencies: uniqueStrings(epistemicClassSchema).refine(
      (values) => values.length > 0,
      'At least one epistemic class dependency is required',
    ),
    supportingSignalIds: uniqueStrings(uuid).refine((values) => values.length > 0),
    supportingComparisonKeys: uniqueStrings(nonBlank).refine((values) => values.length > 0),
    claimReferences: z.array(groundedClaimReferenceSchema).min(1),
    numericClaims: z.array(groundedNumericClaimSchema),
    hypothesisEngineVersion: z.literal(LLM_STRATEGIC_HYPOTHESIS_ENGINE_VERSION),
    generationProvenance: llmGenerationProvenanceSchema,
    hypothesisHash: hash,
  })
  .strict();

export const persistedLlmExperimentPayloadSchema = z
  .object({
    hypothesisRef,
    competitorId: uuid,
    title: nonBlank,
    objective: nonBlank,
    hypothesisUnderTest: nonBlank,
    variableUnderTest: nonBlank,
    design: z
      .object({
        comparison: z.literal('control_vs_treatment'),
        variablePolicy: z.literal('single_variable'),
        controlDescription: nonBlank,
        treatmentDescription: nonBlank,
      })
      .strict(),
    primaryMetric: experimentMetricNameSchema,
    guardrailMetrics: uniqueStrings(experimentMetricNameSchema).refine(
      (values) => values.length > 0,
    ),
    implementationNotes: z.array(nonBlank).min(1),
    caveatCategory: z.enum([
      'shipping_margin_exposure',
      'policy_return_refund_exposure',
      'subscription_customer_fit_and_cancellation',
      'promotion_margin_exposure',
    ]),
    caveatStatement: nonBlank,
    claimReferences: z.array(groundedClaimReferenceSchema).min(1),
    numericClaims: z.array(groundedNumericClaimSchema),
    experimentEngineVersion: z.literal(LLM_RECOMMENDED_EXPERIMENT_ENGINE_VERSION),
    generationProvenance: llmGenerationProvenanceSchema,
    experimentHash: hash,
  })
  .strict()
  .refine(
    (experiment) => !experiment.guardrailMetrics.includes(experiment.primaryMetric),
    'Guardrail metrics must not include the primary metric',
  );

export const persistedLlmExecutiveBriefingPayloadSchema = z
  .object({
    headline: nonBlank,
    strategicPostureSummary: nonBlank,
    keyTakeaway: nonBlank,
    supportingHypothesisRefs: uniqueStrings(hypothesisRef),
    claimReferences: z.array(groundedClaimReferenceSchema),
    numericClaims: z.array(groundedNumericClaimSchema),
    generationProvenance: llmGenerationProvenanceSchema,
  })
  .strict();

// Exact JSON payload accepted by public.persist_llm_intelligence_generation(jsonb).
export const llmIntelligencePersistencePayloadSchema = z
  .object({
    generationRunId: uuid,
    ownedBrandId: uuid,
    competitorIds: z
      .array(uuid)
      .min(1)
      .max(5)
      .refine(
        (ids) => ids.every((id, index) => index === 0 || ids[index - 1]! < id),
        'Competitor IDs must be unique and sorted',
      ),
    analysisObjective: analysisObjectiveSchema,
    contextVersion: nonBlank,
    intelligenceContext: z.record(z.string(), z.unknown()),
    intelligenceContextHash: hash,
    contextGeneratedAt: timestamp,
    promptVersion: nonBlank,
    validatorContractVersion: nonBlank,
    providerId: nonBlank,
    modelId: nonBlank,
    modelParameters: intelligenceModelParametersRecordSchema,
    outcome: intelligenceGenerationOutcomeSchema,
    fallbackReason: intelligenceFallbackReasonSchema.nullable(),
    validationStatus: intelligenceValidationStatusSchema.nullable(),
    validationSummary: intelligenceValidationSummarySchema.nullable(),
    acceptedHypothesisCount: nonNegativeInteger,
    acceptedExperimentCount: nonNegativeInteger,
    executiveBriefingAccepted: z.boolean(),
    attempts: z
      .array(persistedGenerationAttemptPayloadSchema)
      .min(1)
      .max(MAX_PERSISTED_GENERATION_ATTEMPTS),
    hypotheses: z.array(persistedLlmHypothesisPayloadSchema),
    experiments: z.array(persistedLlmExperimentPayloadSchema),
    executiveBriefing: persistedLlmExecutiveBriefingPayloadSchema.nullable(),
  })
  .strict()
  .superRefine((payload, context) => {
    const llmAccepted = payload.outcome === 'llm_success' || payload.outcome === 'llm_partial';
    const expectedValidationStatus = {
      llm_success: 'passed',
      llm_partial: 'partial',
      llm_rejected: 'failed',
    } as const;
    if ((payload.outcome === 'deterministic_fallback') !== (payload.fallbackReason !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallbackReason'],
        message: 'A fallback reason is required exactly for deterministic fallback outcomes',
      });
    }
    if (
      payload.outcome !== 'deterministic_fallback' &&
      payload.validationStatus !== expectedValidationStatus[payload.outcome]
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validationStatus'],
        message: 'Validation status must match the persisted LLM outcome',
      });
    }
    if (
      payload.hypotheses.length !== payload.acceptedHypothesisCount ||
      payload.experiments.length !== payload.acceptedExperimentCount ||
      (payload.executiveBriefing !== null) !== payload.executiveBriefingAccepted
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Accepted counts must match the accepted items',
      });
    }
    if (
      !llmAccepted &&
      (payload.hypotheses.length > 0 ||
        payload.experiments.length > 0 ||
        payload.executiveBriefing !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Only accepted LLM outcomes may carry customer-facing intelligence',
      });
    }
    const refs = new Set(payload.hypotheses.map((hypothesis) => hypothesis.ref));
    if (refs.size !== payload.hypotheses.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hypotheses'],
        message: 'Hypothesis refs must be unique',
      });
    }
    for (const [index, experiment] of payload.experiments.entries()) {
      if (!refs.has(experiment.hypothesisRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['experiments', index, 'hypothesisRef'],
          message: 'Experiments must depend on a persisted accepted hypothesis ref',
        });
      }
    }
    for (const ref of payload.executiveBriefing?.supportingHypothesisRefs ?? []) {
      if (!refs.has(ref)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['executiveBriefing', 'supportingHypothesisRefs'],
          message: 'Briefing support must reference persisted accepted hypothesis refs',
        });
      }
    }
  });
export type LlmIntelligencePersistencePayload = z.infer<
  typeof llmIntelligencePersistencePayloadSchema
>;

// Exact JSON result returned by public.persist_llm_intelligence_generation(jsonb).
export const llmIntelligencePersistenceResultSchema = z
  .object({
    generationRunId: uuid,
    outcome: intelligenceGenerationOutcomeSchema,
    hypotheses: z.array(z.object({ ref: hypothesisRef, id: uuid }).strict()),
    experiments: z.array(
      z.object({ position: nonNegativeInteger, hypothesisRef, id: uuid }).strict(),
    ),
    executiveBriefingId: uuid.nullable(),
  })
  .strict();
export type LlmIntelligencePersistenceResult = z.infer<
  typeof llmIntelligencePersistenceResultSchema
>;
