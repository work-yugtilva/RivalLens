import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DeterministicMockIntelligenceProvider,
  MAX_PROVIDER_INVOCATIONS,
  type FallbackReason,
  type IntelligenceModelParameters,
  type IntelligenceProviderErrorCode,
  type IntelligenceResponseTelemetry,
} from '../../packages/ai/src';
import { EVALUATION_VERSION } from '../../packages/eval/src/config/evaluationVersion';
import {
  buildIntelligenceContext,
  INTELLIGENCE_VALIDATOR_CONTRACT_VERSION,
  intelligenceContextHash,
  prepareIntelligenceGenerationPersistence,
  validateIntelligenceSynthesis,
} from '../../packages/intelligence/src';
import {
  llmIntelligenceSynthesisOutputSchema,
  MAX_PERSISTED_GENERATION_ATTEMPTS,
  type IntelligenceContext,
  type IntelligenceFallbackReason,
  type LlmIntelligencePersistencePayload,
  type LlmIntelligenceSynthesisOutput,
  type PersistIntelligenceGenerationInput,
} from '../../packages/schemas/src';
import { COMPETITOR_ID, GENERATED_AT, reportInput, uuid } from './fixtures/competitive-reports';

const RUN_ID = '9a9a9a9a-0000-4000-8000-000000000001';
const PROVIDER_ID = 'deterministic-mock';
const MODEL_ID = 'phase-3a';

function frozenContext(generatedAt = GENERATED_AT): IntelligenceContext {
  const input = reportInput();
  return buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt,
  });
}

async function mockOutput(
  context: IntelligenceContext,
  scenario: ConstructorParameters<typeof DeterministicMockIntelligenceProvider>[0] = 'valid',
): Promise<LlmIntelligenceSynthesisOutput> {
  const provider = new DeterministicMockIntelligenceProvider(scenario);
  const response = await provider.generateStructured({
    promptVersion: 'intelligence-synthesis-v1',
    systemPrompt: 'test',
    context,
    contextHash: intelligenceContextHash(context),
    responseSchema: llmIntelligenceSynthesisOutputSchema,
    schemaName: 'llm-intelligence-synthesis-v1',
  });
  return response.rawOutput as LlmIntelligenceSynthesisOutput;
}

function telemetry(overrides: Partial<IntelligenceResponseTelemetry> = {}) {
  return {
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    latencyMs: 12,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    estimatedCostUsd: null,
    rawResponseId: 'resp-1',
    finishReason: 'stop',
    ...overrides,
  };
}

function request(
  context: unknown,
  output: unknown,
  overrides: Partial<PersistIntelligenceGenerationInput> = {},
): PersistIntelligenceGenerationInput {
  return {
    generationRunId: RUN_ID,
    context,
    contextHash: intelligenceContextHash(context as IntelligenceContext),
    promptVersion: 'intelligence-synthesis-v1',
    providerId: PROVIDER_ID,
    modelId: MODEL_ID,
    parameters: { temperature: 0, maxOutputTokens: 4096 },
    attempts: [
      {
        attemptNumber: 1,
        kind: 'initial',
        promptVersion: 'intelligence-synthesis-v1',
        telemetry: telemetry(),
        rawOutput: { value: output },
      },
    ],
    generationOutcome: { kind: 'llm_candidate' },
    ...overrides,
  };
}

function ready(input: unknown): LlmIntelligencePersistencePayload {
  const result = prepareIntelligenceGenerationPersistence(input);
  if (result.status !== 'ready') {
    throw new Error(`expected ready, got ${result.code}: ${JSON.stringify(result.issues)}`);
  }
  return result.payload;
}

describe('prepareIntelligenceGenerationPersistence: frozen context and hash', () => {
  it('persists the exact frozen context with its verified hash', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await mockOutput(context)));

    expect(payload.intelligenceContext).toEqual(context);
    expect(payload.intelligenceContextHash).toBe(intelligenceContextHash(context));
    expect(payload.ownedBrandId).toBe(context.brand.id);
    expect(payload.competitorIds).toEqual(context.competitors.map((competitor) => competitor.id));
    expect(payload.contextGeneratedAt).toBe(context.generatedAt);
  });

  it('fails closed when the declared hash does not match the frozen context', async () => {
    const context = frozenContext();
    const input = request(context, await mockOutput(context), {
      contextHash: `sha256:${'0'.repeat(64)}`,
    });

    expect(prepareIntelligenceGenerationPersistence(input)).toMatchObject({
      status: 'rejected',
      code: 'CONTEXT_HASH_MISMATCH',
    });
  });

  it('rejects a malformed frozen context', async () => {
    const context = frozenContext();
    const output = await mockOutput(context);
    const malformed = { ...context, contextVersion: 'intelligence-context-v0' };

    expect(
      prepareIntelligenceGenerationPersistence({
        ...request(context, output),
        context: malformed,
      }),
    ).toMatchObject({ status: 'rejected', code: 'INVALID_CONTEXT' });
  });

  it('rejects a context carrying fields the model contract does not define', async () => {
    const context = frozenContext();
    const withExtra = { ...context, injected: 'x' };

    expect(
      prepareIntelligenceGenerationPersistence({
        ...request(context, await mockOutput(context)),
        context: withExtra,
        contextHash: intelligenceContextHash(withExtra as IntelligenceContext),
      }),
    ).toMatchObject({ status: 'rejected', code: 'INVALID_CONTEXT' });
  });

  it('does not rebuild the context: a historical generatedAt is preserved verbatim', async () => {
    const historical = '2020-01-02T03:04:05.000Z';
    const context = frozenContext(historical);
    const payload = ready(request(context, await mockOutput(context)));

    expect(payload.contextGeneratedAt).toBe(historical);
    expect((payload.intelligenceContext as IntelligenceContext).generatedAt).toBe(historical);
    expect(payload.intelligenceContextHash).toBe(intelligenceContextHash(context));
    expect(payload.intelligenceContextHash).not.toBe(intelligenceContextHash(frozenContext()));
  });
});

describe('prepareIntelligenceGenerationPersistence: validation boundary', () => {
  it('persists a fully valid synthesis as llm_success', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await mockOutput(context)));

    expect(payload).toMatchObject({
      outcome: 'llm_success',
      validationStatus: 'passed',
      fallbackReason: null,
      acceptedHypothesisCount: 1,
      acceptedExperimentCount: 1,
      executiveBriefingAccepted: true,
      validatorContractVersion: INTELLIGENCE_VALIDATOR_CONTRACT_VERSION,
    });
  });

  it('keeps schema-valid but ungrounded output out of customer-facing payload', async () => {
    const context = frozenContext();
    const output = await mockOutput(context, 'unknown_evidence_id');
    expect(llmIntelligenceSynthesisOutputSchema.safeParse(output).success).toBe(true);

    const payload = ready(request(context, output));

    expect(payload.outcome).toBe('llm_rejected');
    expect(payload.validationStatus).toBe('failed');
    expect(payload.hypotheses).toEqual([]);
    expect(payload.experiments).toEqual([]);
    expect(payload.executiveBriefing).toBeNull();
    // Raw output survives only in the audit attempt record.
    expect(payload.attempts[0]).toMatchObject({ rawOutputCaptured: true, rawOutput: output });
  });

  it('revalidates instead of trusting a smuggled orchestration verdict', async () => {
    const context = frozenContext();
    const output = await mockOutput(context, 'unknown_evidence_id');
    const valid = await mockOutput(context);

    for (const smuggled of [
      { acceptedOutput: { hypotheses: valid.hypotheses, experiments: valid.experiments } },
      { validation: { status: 'passed' } },
      { status: 'llm_success' },
    ]) {
      expect(
        prepareIntelligenceGenerationPersistence({ ...request(context, output), ...smuggled }),
      ).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    }
    // Without the smuggled fields, the same raw output is judged by the validator alone.
    expect(ready(request(context, output)).outcome).toBe('llm_rejected');
  });

  it('derives the outcome from the final attempt, never an earlier accepted one', async () => {
    const context = frozenContext();
    const valid = await mockOutput(context);
    const invalid = await mockOutput(context, 'unknown_evidence_id');

    const payload = ready(
      request(context, valid, {
        attempts: [
          {
            attemptNumber: 1,
            kind: 'initial',
            promptVersion: 'intelligence-synthesis-v1',
            telemetry: telemetry(),
            rawOutput: { value: valid },
          },
          {
            attemptNumber: 2,
            kind: 'retry',
            retryReason: 'validation_repair',
            promptVersion: 'intelligence-synthesis-v1:repair-v1',
            telemetry: telemetry(),
            rawOutput: { value: invalid },
          },
        ],
      }),
    );

    expect(payload.outcome).toBe('llm_rejected');
    expect(payload.hypotheses).toEqual([]);
    expect(payload.attempts.map((attempt) => attempt.validationStatus)).toEqual([
      'passed',
      'failed',
    ]);
  });

  it('persists only the accepted components of a partial synthesis', async () => {
    const context = frozenContext();
    const output = await mockOutput(context, 'partial_stable_refs');
    const validation = validateIntelligenceSynthesis({ context, output });
    expect(validation.status).toBe('partial');

    const payload = ready(request(context, output));

    expect(payload.outcome).toBe('llm_partial');
    expect(payload.validationStatus).toBe('partial');
    expect(payload.hypotheses.map((hypothesis) => hypothesis.ref)).toEqual(['h2']);
    expect(payload.hypotheses[0]!.supportingSignalIds).toEqual(
      validation.acceptedOutput.hypotheses[0]!.supportingSignalIds,
    );
    expect(payload.validationSummary?.hypotheses).toEqual([
      { index: 0, status: 'rejected', errorCodes: expect.arrayContaining(['UNKNOWN_SIGNAL_ID']) },
      { index: 1, status: 'accepted', errorCodes: [] },
    ]);
    expect(payload.validationSummary?.errors.length).toBeGreaterThan(0);
  });

  it('writes no customer-facing intelligence when validation fails', async () => {
    const context = frozenContext();
    const payload = ready(request(context, { hypotheses: 'invalid' }));

    expect(payload).toMatchObject({
      outcome: 'llm_rejected',
      acceptedHypothesisCount: 0,
      acceptedExperimentCount: 0,
      executiveBriefingAccepted: false,
      hypotheses: [],
      experiments: [],
      executiveBriefing: null,
    });
  });

  it('omits validator messages from the audit summary', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await mockOutput(context, 'malicious_repair_target')));

    expect(JSON.stringify(payload.validationSummary)).not.toContain('IGNORE ALL PRIOR');
    expect(payload.validationSummary?.errors.every((error) => !('message' in error))).toBe(true);
  });

  it('requires captured final output for an LLM candidate', async () => {
    const context = frozenContext();
    const input = request(context, await mockOutput(context));
    delete input.attempts[0]!.rawOutput;

    expect(prepareIntelligenceGenerationPersistence(input)).toMatchObject({
      status: 'rejected',
      code: 'MISSING_CANDIDATE_OUTPUT',
    });
  });

  it('rejects telemetry from a different provider or model than the run', async () => {
    const context = frozenContext();
    const input = request(context, await mockOutput(context));
    input.attempts[0]!.telemetry = telemetry({ modelId: 'other-model' });

    expect(prepareIntelligenceGenerationPersistence(input)).toMatchObject({
      status: 'rejected',
      code: 'INVALID_INPUT',
    });
  });
});

describe('prepareIntelligenceGenerationPersistence: stable hypothesis dependencies', () => {
  async function twoHypothesisOutput(context: IntelligenceContext) {
    const output = await mockOutput(context);
    const second = structuredClone(output.hypotheses[0]!);
    second.ref = 'h2';
    second.theme = 'pricing_strategy';
    second.statement = 'The competitor may be using threshold pricing to shape basket size.';
    output.hypotheses.push(second);
    const secondExperiment = structuredClone(output.experiments[0]!);
    secondExperiment.hypothesisRef = 'h2';
    secondExperiment.title = 'Test threshold messaging against basket size';
    output.experiments.push(secondExperiment);
    return output;
  }

  it('maps each experiment to the exact accepted hypothesis ref it was validated against', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await twoHypothesisOutput(context)));

    expect(payload.hypotheses.map((hypothesis) => hypothesis.ref)).toEqual(['h1', 'h2']);
    expect(payload.experiments.map((experiment) => experiment.hypothesisRef)).toEqual(['h1', 'h2']);
    expect(payload.experiments[1]!.title).toBe('Test threshold messaging against basket size');
  });

  it('keeps dependency identity when hypothesis arrays are reordered', async () => {
    const context = frozenContext();
    const output = await twoHypothesisOutput(context);
    output.hypotheses.reverse();

    const payload = ready(request(context, output));

    expect(payload.hypotheses.map((hypothesis) => hypothesis.ref)).toEqual(['h2', 'h1']);
    const byRef = new Map(payload.hypotheses.map((hypothesis) => [hypothesis.ref, hypothesis]));
    for (const experiment of payload.experiments) {
      expect(byRef.has(experiment.hypothesisRef)).toBe(true);
    }
    expect(
      payload.experiments.find((experiment) => experiment.hypothesisRef === 'h2')!.title,
    ).toBe('Test threshold messaging against basket size');
  });

  it('never gives a rejected hypothesis a dependent experiment', async () => {
    const context = frozenContext();
    const output = await mockOutput(context, 'invalid_hypothesis_with_dependent_experiment');

    const payload = ready(request(context, output));

    expect(payload.hypotheses).toEqual([]);
    expect(payload.experiments).toEqual([]);
    expect(payload.validationSummary?.experiments[0]).toMatchObject({
      status: 'rejected',
      errorCodes: expect.arrayContaining(['EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS']),
    });
  });

  it('rejects unknown hypothesis refs from experiments', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await mockOutput(context, 'unknown_hypothesis_ref')));

    expect(payload.experiments).toEqual([]);
    expect(payload.executiveBriefing).toBeNull();
  });
});

describe('prepareIntelligenceGenerationPersistence: epistemics and provenance', () => {
  it('preserves a reported snippet claim without promoting its epistemic class', async () => {
    const context = frozenContext();
    context.untrustedSnippets = [
      {
        snippetId: 'snip-1',
        subjectId: COMPETITOR_ID,
        subjectRole: 'competitor',
        sourceUrl: 'https://rival.test/',
        sourceId: uuid(901),
        snapshotId: uuid(911),
        observationId: uuid(1002),
        field: 'positioning.homepage.headline',
        text: 'Free delivery on every order.',
        epistemicClass: 'reported',
      },
    ];
    const output = await mockOutput(context);
    const reportedReference = {
      kind: 'snippet' as const,
      snippetId: 'snip-1',
      subjectId: COMPETITOR_ID,
      assertion: 'fact' as const,
      claimedEpistemicClass: 'reported' as const,
    };
    output.hypotheses[0]!.claimReferences.push(reportedReference);
    output.hypotheses[0]!.epistemicClassDependencies.push('reported');

    const payload = ready(request(context, output));

    expect(payload.outcome).toBe('llm_success');
    expect(payload.hypotheses[0]!.epistemicClassDependencies).toEqual([
      'observed',
      'derived',
      'reported',
    ]);
    expect(payload.hypotheses[0]!.claimReferences).toContainEqual(reportedReference);
    expect(payload.hypotheses[0]!.claimReferences).toEqual(output.hypotheses[0]!.claimReferences);
    expect(payload.hypotheses[0]!.supportingSignalIds).toEqual(
      output.hypotheses[0]!.supportingSignalIds,
    );
    expect(payload.hypotheses[0]!.supportingComparisonKeys).toEqual(
      output.hypotheses[0]!.supportingComparisonKeys,
    );
  });

  it('stamps LLM provenance tied to the run, provider, model, prompt, context and validator', async () => {
    const context = frozenContext();
    const payload = ready(request(context, await mockOutput(context)));
    const expected = {
      method: 'llm_synthesized',
      generationRunId: RUN_ID,
      providerId: PROVIDER_ID,
      modelId: MODEL_ID,
      promptVersion: 'intelligence-synthesis-v1',
      intelligenceContextHash: intelligenceContextHash(context),
      validatorContractVersion: INTELLIGENCE_VALIDATOR_CONTRACT_VERSION,
    };

    expect(payload.hypotheses[0]!.generationProvenance).toEqual(expected);
    expect(payload.experiments[0]!.generationProvenance).toEqual(expected);
    expect(payload.executiveBriefing!.generationProvenance).toEqual(expected);
    expect(payload.hypotheses[0]!.hypothesisEngineVersion).toBe('strategic-hypotheses-v2-llm');
    expect(payload.experiments[0]!.experimentEngineVersion).toBe('recommended-experiments-v2-llm');
  });

  it('audits a deterministic fallback without minting LLM intelligence or provenance', async () => {
    const context = frozenContext();
    const output = await mockOutput(context, 'partial_insufficient');
    const payload = ready(
      request(context, output, {
        generationOutcome: {
          kind: 'deterministic_fallback',
          fallbackReason: 'VALIDATION_REPAIR_EXHAUSTED',
        },
      }),
    );

    expect(payload).toMatchObject({
      outcome: 'deterministic_fallback',
      fallbackReason: 'VALIDATION_REPAIR_EXHAUSTED',
      validationStatus: 'partial',
      acceptedHypothesisCount: 0,
      acceptedExperimentCount: 0,
      executiveBriefingAccepted: false,
      hypotheses: [],
      experiments: [],
      executiveBriefing: null,
    });
    expect(JSON.stringify(payload)).not.toContain('llm_synthesized');
  });

  it('records a provider failure with no raw output and no invented telemetry', async () => {
    const context = frozenContext();
    const payload = ready(
      request(context, undefined, {
        attempts: [
          {
            attemptNumber: 1,
            kind: 'initial',
            promptVersion: 'intelligence-synthesis-v1',
            providerFailure: 'rate_limit',
            providerFailureMetadata: { httpStatus: 429, providerRequestId: 'req-1' },
          },
        ],
        generationOutcome: {
          kind: 'deterministic_fallback',
          fallbackReason: 'PROVIDER_NON_RETRYABLE_FAILURE',
        },
      }),
    );

    expect(payload.validationStatus).toBeNull();
    expect(payload.validationSummary).toBeNull();
    expect(payload.attempts[0]).toEqual({
      attemptNumber: 1,
      kind: 'initial',
      retryReason: null,
      promptVersion: 'intelligence-synthesis-v1',
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      rawResponseId: null,
      finishReason: null,
      providerFailure: 'rate_limit',
      providerFailureMetadata: { httpStatus: 429, providerRequestId: 'req-1' },
      rawOutputCaptured: false,
      rawOutput: null,
      validationStatus: null,
      validationErrorCodes: [],
    });
  });

  it('keeps unavailable token telemetry and unknown cost as null, not zero', async () => {
    const context = frozenContext();
    const input = request(context, await mockOutput(context));
    input.attempts[0]!.telemetry = telemetry({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
    });

    const attempt = ready(input).attempts[0]!;

    expect(attempt).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
      latencyMs: 12,
    });
  });

  it('rejects credential-bearing or unknown fields in parameters and failure metadata', async () => {
    const context = frozenContext();
    const output = await mockOutput(context);

    expect(
      prepareIntelligenceGenerationPersistence({
        ...request(context, output),
        parameters: { temperature: 0, apiKey: 'sk-test' },
      }),
    ).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    expect(
      prepareIntelligenceGenerationPersistence(
        request(context, undefined, {
          attempts: [
            {
              attemptNumber: 1,
              kind: 'initial',
              promptVersion: 'intelligence-synthesis-v1',
              providerFailure: 'authentication_configuration',
              providerFailureMetadata: {
                httpStatus: 401,
                headers: { authorization: 'Bearer x' },
              } as never,
            },
          ],
          generationOutcome: {
            kind: 'deterministic_fallback',
            fallbackReason: 'PROVIDER_NON_RETRYABLE_FAILURE',
          },
        }),
      ),
    ).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
  });
});

describe('persistence contract tripwires', () => {
  it('pins the validator contract version to the evaluation harness contract', () => {
    expect(INTELLIGENCE_VALIDATOR_CONTRACT_VERSION).toBe(
      EVALUATION_VERSION.validatorContractVersion,
    );
  });

  it('mirrors the orchestration fallback, failure, parameter and attempt contracts', () => {
    expectTypeOf<IntelligenceFallbackReason>().toEqualTypeOf<FallbackReason>();
    expectTypeOf<
      NonNullable<PersistIntelligenceGenerationInput['attempts'][number]['providerFailure']>
    >().toEqualTypeOf<IntelligenceProviderErrorCode>();
    expectTypeOf<IntelligenceModelParameters>().toMatchTypeOf<
      PersistIntelligenceGenerationInput['parameters']
    >();
    expect(MAX_PERSISTED_GENERATION_ATTEMPTS).toBe(MAX_PROVIDER_INVOCATIONS);
  });
});
