import { describe, expect, it } from 'vitest';
import * as intelligence from '../../packages/intelligence/src';
import { validateIntelligenceSynthesis } from '../../packages/intelligence/src';
import type {
  GroundedClaimReference,
  IntelligenceContext,
  LlmIntelligenceSynthesisOutput,
} from '../../packages/schemas/src';
import { BRAND_ID, COMPETITOR_ID, GENERATED_AT, reportInput } from './fixtures/competitive-reports';

type Validator = (input: { context: unknown; output: unknown }) => {
  status: 'passed' | 'partial' | 'failed';
  hypotheses: Array<{ status: 'accepted' | 'rejected' }>;
  experiments: Array<{ status: 'accepted' | 'rejected' }>;
  executiveBriefing: { status: 'accepted' | 'rejected' };
  errors: Array<{ code: string; path: Array<string | number> }>;
  acceptedOutput: {
    executiveBriefing?: LlmIntelligenceSynthesisOutput['executiveBriefing'];
    hypotheses: LlmIntelligenceSynthesisOutput['hypotheses'];
    experiments: LlmIntelligenceSynthesisOutput['experiments'];
  };
};

function fixture(): {
  context: IntelligenceContext;
  output: LlmIntelligenceSynthesisOutput;
} {
  const input = reportInput();
  const context = intelligence.buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const signal = context.signals.find(
    (candidate) => candidate.comparisonKey === 'offer.free_shipping_threshold',
  )!;
  const comparisonReference = {
    kind: 'comparison' as const,
    comparisonKey: signal.comparisonKey,
    competitorId: COMPETITOR_ID,
    subjectId: COMPETITOR_ID,
    assertion: 'fact' as const,
    claimedEpistemicClass: 'observed' as const,
  };
  const signalReference = {
    kind: 'signal' as const,
    signalId: signal.id,
    subjectId: COMPETITOR_ID,
    assertion: 'fact' as const,
    claimedEpistemicClass: 'derived' as const,
  };

  return {
    context,
    output: {
      executiveBriefing: {
        headline: 'A rival may be reducing purchase friction',
        strategicPostureSummary:
          'The available evidence supports testing a lower shipping threshold for this market.',
        keyTakeaway: 'Treat the competitive pattern as a testable signal, not a known outcome.',
        supportingHypothesisIndexes: [0],
        claimReferences: [comparisonReference],
        numericClaims: [],
      },
      hypotheses: [
        {
          competitorId: COMPETITOR_ID,
          theme: 'shipping_friction',
          statement: 'The competitor may be using shipping policy to reduce purchase friction.',
          rationale:
            'Observed policy evidence and the derived signal justify testing this possibility.',
          supportingSignalIds: [signal.id],
          supportingComparisonKeys: [signal.comparisonKey],
          confidence: 'medium',
          uncertainty: {
            category: 'conversion_effect_not_established',
            statement: 'The effect on customer behavior is not established by public evidence.',
          },
          assumptions: ['Shipping policy is visible to comparable customer segments.'],
          epistemicClassDependencies: ['observed', 'derived'],
          claimReferences: [comparisonReference, signalReference],
          numericClaims: [],
        },
      ],
      experiments: [
        {
          competitorId: COMPETITOR_ID,
          hypothesisIndex: 0,
          title: 'Test a lower free shipping threshold',
          objective: 'Measure whether a threshold change affects checkout behavior.',
          hypothesisUnderTest:
            'A lower threshold may improve checkout completion without unacceptable margin loss.',
          variableUnderTest: 'free_shipping_threshold',
          design: {
            comparison: 'control_vs_treatment',
            variablePolicy: 'single_variable',
            controlDescription: 'Keep the current shipping threshold as the control experience.',
            treatmentDescription: 'Show a lower shipping threshold in the treatment experience.',
          },
          primaryMetric: 'checkout_conversion_rate',
          guardrailMetrics: ['contribution_margin_per_order', 'shipping_cost_per_order'],
          implementationNotes: [
            'Keep all non-target checkout elements consistent.',
            'Review segment balance before interpreting the result.',
          ],
          caveat: {
            category: 'shipping_margin_exposure',
            statement: 'A lower threshold may increase shipping subsidy costs.',
          },
        },
      ],
    },
  };
}

function percentageFixture() {
  const input = reportInput([
    {
      key: 'offer.discount:percentage:12',
      owned: { type: 'percentage', amount: 12 },
      competitor: false,
    },
    {
      key: 'offer.discount:percentage:30',
      owned: false,
      competitor: { type: 'percentage', amount: 30 },
    },
  ]);
  const context = intelligence.buildIntelligenceContext({
    comparison: input.comparison,
    signals: input.currentSignals,
    generatedAt: GENERATED_AT,
  });
  const output = fixture().output;
  const signal = context.signals[0]!;
  const signalReference = {
    kind: 'signal' as const,
    signalId: signal.id,
    subjectId: COMPETITOR_ID,
    assertion: 'fact' as const,
    claimedEpistemicClass: 'derived' as const,
  };
  output.hypotheses[0]!.supportingSignalIds = [signal.id];
  output.hypotheses[0]!.supportingComparisonKeys = [signal.comparisonKey];
  output.hypotheses[0]!.epistemicClassDependencies = ['derived'];
  output.hypotheses[0]!.claimReferences = [signalReference];
  output.executiveBriefing.claimReferences = [signalReference];
  return { context, output, numericReference: signalReference };
}

describe('validateIntelligenceSynthesis', () => {
  it('passes a fully grounded synthesis and accepts every item', () => {
    const validate = (intelligence as unknown as { validateIntelligenceSynthesis?: Validator })
      .validateIntelligenceSynthesis;
    expect(validate).toBeTypeOf('function');
    if (!validate) return;

    const input = fixture();
    const result = validate(input);

    expect(result.status).toBe('passed');
    expect(result.errors).toEqual([]);
    expect(result.hypotheses.map((item) => item.status)).toEqual(['accepted']);
    expect(result.experiments.map((item) => item.status)).toEqual(['accepted']);
    expect(result.executiveBriefing.status).toBe('accepted');
    expect(result.acceptedOutput).toEqual(input.output);
  });

  it('rejects a syntactically valid signal ID that is absent from the context', () => {
    const input = fixture();
    input.output.hypotheses[0]!.supportingSignalIds[0] = '00000000-0000-4000-8000-000000009999';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]).toMatchObject({ status: 'rejected' });
    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain('UNKNOWN_SIGNAL_ID');
  });

  it('rejects a comparison key that is absent for the hypothesis competitor', () => {
    const input = fixture();
    input.output.hypotheses[0]!.supportingComparisonKeys[0] = 'telemetry.conversion_rate';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNKNOWN_COMPARISON_KEY',
    );
  });

  it.each([
    [
      {
        kind: 'observation',
        observationId: '00000000-0000-4000-8000-000000009997',
        subjectId: COMPETITOR_ID,
        assertion: 'fact',
        claimedEpistemicClass: 'observed',
      },
      'UNKNOWN_OBSERVATION_ID',
    ],
    [
      {
        kind: 'change',
        changeId: '00000000-0000-4000-8000-000000009996',
        subjectId: COMPETITOR_ID,
        assertion: 'fact',
        claimedEpistemicClass: 'derived',
      },
      'UNKNOWN_CHANGE_ID',
    ],
    [
      {
        kind: 'snippet',
        snippetId: 'missing-snippet',
        subjectId: COMPETITOR_ID,
        assertion: 'fact',
        claimedEpistemicClass: 'observed',
      },
      'UNKNOWN_SNIPPET_ID',
    ],
  ] as const)(
    'rejects an unknown structured evidence reference with %s',
    (reference, expectedCode) => {
      const input = fixture();
      input.output.hypotheses[0]!.claimReferences[0] = reference as GroundedClaimReference;

      const result = validateIntelligenceSynthesis(input);

      expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(expectedCode);
    },
  );

  it('rejects cross-subject attribution of an existing competitor signal', () => {
    const input = fixture();
    const signalReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'signal',
    )!;
    signalReference.subjectId = BRAND_ID;

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'COMPETITOR_ATTRIBUTION_MISMATCH',
    );
  });

  it('rejects an unknown hypothesis competitor ID', () => {
    const input = fixture();
    input.output.hypotheses[0]!.competitorId = '00000000-0000-4000-8000-000000009995';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNKNOWN_COMPETITOR_ID',
    );
  });

  it('accepts the exact percentage-point delta and direction in cited context', () => {
    const input = percentageFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 18,
        unit: 'percentage_points',
        valueRole: 'delta',
        direction: 'competitor_higher',
        reference: input.numericReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]).toMatchObject({ status: 'accepted', errors: [] });
  });

  it('rejects an invented structured numeric value', () => {
    const input = percentageFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 19,
        unit: 'percentage_points',
        valueRole: 'delta',
        direction: 'competitor_higher',
        reference: input.numericReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects a numeric claim with the wrong unit', () => {
    const input = percentageFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 18,
        unit: 'days',
        valueRole: 'delta',
        direction: 'competitor_higher',
        reference: input.numericReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain('UNIT_MISMATCH');
  });

  it('distinguishes percent values from percentage-point deltas', () => {
    const input = percentageFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 18,
        unit: 'percent',
        valueRole: 'delta',
        direction: 'competitor_higher',
        reference: input.numericReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain('UNIT_MISMATCH');
  });

  it('rejects an incorrect numeric delta direction', () => {
    const input = percentageFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 18,
        unit: 'percentage_points',
        valueRole: 'delta',
        direction: 'competitor_lower',
        reference: input.numericReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'DELTA_DIRECTION_MISMATCH',
    );
  });

  it('rejects attributing an owned numeric value to a competitor subject', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 75,
        unit: 'usd',
        valueRole: 'owned',
        reference: comparisonReference,
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'COMPETITOR_ATTRIBUTION_MISMATCH',
    );
  });

  it('rejects promotion of estimated context evidence to observed fact', () => {
    const input = fixture();
    input.context.facts[0]!.epistemicClass = 'estimated';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'EPISTEMIC_CLASS_VIOLATION',
    );
  });

  it('rejects treating unknown comparison state as explicit absence', () => {
    const input = fixture();
    input.context.facts[0]!.competitor.state = 'unknown';
    input.context.facts[0]!.competitor.value = null;
    input.context.facts[0]!.competitor.provenance = null;
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    comparisonReference.assertion = 'absence';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain('UNKNOWN_AS_ABSENCE');
  });

  it('rejects an experiment whose hypothesis failed while retaining independent valid items', () => {
    const input = fixture();
    const invalidHypothesis = structuredClone(input.output.hypotheses[0]!);
    invalidHypothesis.supportingSignalIds[0] = '00000000-0000-4000-8000-000000009994';
    input.output.hypotheses.push(invalidHypothesis);
    const dependentExperiment = structuredClone(input.output.experiments[0]!);
    dependentExperiment.hypothesisIndex = 1;
    input.output.experiments.push(dependentExperiment);

    const result = validateIntelligenceSynthesis(input);

    expect(result.status).toBe('partial');
    expect(result.hypotheses.map((item) => item.status)).toEqual(['accepted', 'rejected']);
    expect(result.experiments.map((item) => item.status)).toEqual(['accepted', 'rejected']);
    expect(result.experiments[1]!.errors.map((error) => error.code)).toContain(
      'EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS',
    );
    expect(result.acceptedOutput.hypotheses).toEqual([input.output.hypotheses[0]]);
    expect(result.acceptedOutput.experiments).toEqual([input.output.experiments[0]]);
  });

  it('returns a specific error when the primary metric is also a guardrail', () => {
    const input = fixture();
    input.output.experiments[0]!.guardrailMetrics = [
      'checkout_conversion_rate',
      'shipping_cost_per_order',
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'PRIMARY_METRIC_DUPLICATES_GUARDRAIL',
    );
  });

  it('rejects an independently unsupported briefing claim', () => {
    const input = fixture();
    input.output.executiveBriefing.supportingHypothesisIndexes = [4];

    const result = validateIntelligenceSynthesis(input);

    expect(result.executiveBriefing.status).toBe('rejected');
    expect(result.executiveBriefing.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_BRIEFING_CLAIM',
    );
  });

  it('rejects an uncited number introduced only in hypothesis prose', () => {
    const input = fixture();
    input.output.hypotheses[0]!.rationale =
      'The public evidence proves that checkout conversion improved by 15 percent.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects causal certainty in a hypothesis', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'The competitor shipping policy will guarantee higher checkout conversion.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_CAUSAL_CLAIM',
    );
  });

  it('rejects an experiment framed as a promised result', () => {
    const input = fixture();
    input.output.experiments[0]!.hypothesisUnderTest =
      'A lower threshold will guarantee an increase in checkout completion.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'EXPERIMENT_NOT_FRAMED_AS_TEST',
    );
  });

  it('rejects invented competitor performance in experiment design', () => {
    const input = fixture();
    input.output.experiments[0]!.design.controlDescription =
      'Use the competitor conversion rate of 15 percent as the control benchmark.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_EXPERIMENT_CLAIM',
    );
  });

  it('rejects a caveat category unrelated to the experiment variable', () => {
    const input = fixture();
    input.output.experiments[0]!.caveat.category = 'subscription_customer_fit_and_cancellation';

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'INAPPROPRIATE_EXPERIMENT_CAVEAT',
    );
  });

  it('rejects a briefing that promotes a causal outcome to certainty', () => {
    const input = fixture();
    input.output.executiveBriefing.strategicPostureSummary =
      'The competitor policy proves that conversion will increase for the rival business.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.executiveBriefing.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_BRIEFING_CLAIM',
    );
  });

  it('rejects a briefing that introduces a competitor outside the context', () => {
    const input = fixture();
    input.output.executiveBriefing.strategicPostureSummary =
      'unknown-rival.test appears to have a distinct posture that warrants further investigation.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.executiveBriefing.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_BRIEFING_CLAIM',
    );
  });

  it('requires declared claim references to cover every listed evidence dependency', () => {
    const input = fixture();
    input.output.hypotheses[0]!.claimReferences =
      input.output.hypotheses[0]!.claimReferences.filter(
        (reference) => reference.kind !== 'signal',
      );

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'EVIDENCE_DEPENDENCY_MISMATCH',
    );
  });

  it('returns structured schema errors instead of throwing for malformed model output', () => {
    const { context } = fixture();

    const result = validateIntelligenceSynthesis({ context, output: { hypotheses: 'invalid' } });

    expect(result.status).toBe('failed');
    expect(result.errors[0]).toMatchObject({ code: 'INVALID_OUTPUT_SCHEMA' });
  });

  it('returns byte-for-byte equivalent results for identical inputs', () => {
    const input = fixture();

    const first = validateIntelligenceSynthesis(structuredClone(input));
    const second = validateIntelligenceSynthesis(structuredClone(input));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('is synchronous and completes using only the supplied context and output', () => {
    const result = validateIntelligenceSynthesis(fixture());

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.status).toBe('passed');
  });
});
