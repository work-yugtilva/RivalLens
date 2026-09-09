import { describe, expect, it } from 'vitest';
import * as intelligence from '../../packages/intelligence/src';
import { validateIntelligenceSynthesis } from '../../packages/intelligence/src';
import type {
  GroundedClaimReference,
  IntelligenceContext,
  LlmIntelligenceSynthesisOutput,
} from '../../packages/schemas/src';
import {
  BRAND_ID,
  COMPETITOR_ID,
  GENERATED_AT,
  reportInput,
  uuid,
} from './fixtures/competitive-reports';

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
        supportingHypothesisRefs: ['h1'],
        claimReferences: [comparisonReference],
        numericClaims: [],
      },
      hypotheses: [
        {
          ref: 'h1',
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
          hypothesisRef: 'h1',
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
          claimReferences: [comparisonReference],
          numericClaims: [],
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

function changeFixture() {
  const input = fixture();
  const changeId = uuid(701);
  input.context.recentChanges = [
    {
      id: changeId,
      subjectId: COMPETITOR_ID,
      subjectRole: 'competitor',
      factType: 'offer.free_shipping',
      changeType: 'offer.free_shipping.threshold_changed',
      detectedAt: GENERATED_AT,
      beforeValue: { threshold: 75, unrelated: 11 },
      afterValue: { threshold: 50, unrelated: 99 },
      epistemicClass: 'derived',
      evidence: {
        sourceId: uuid(901),
        currentSnapshotId: uuid(911),
        previousSnapshotId: uuid(910),
        currentObservationId: uuid(1002),
        previousObservationId: uuid(1001),
      },
    },
  ];
  return {
    input,
    reference: {
      kind: 'change' as const,
      changeId,
      subjectId: COMPETITOR_ID,
      assertion: 'fact' as const,
      claimedEpistemicClass: 'derived' as const,
    },
  };
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

  it('rejects an observed claim backed by a fact with null provenance', () => {
    const input = fixture();
    input.context.facts[0]!.competitor.provenance = null;
    input.context.facts[0]!.epistemicClass = 'derived';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'EPISTEMIC_CLASS_VIOLATION',
    );
  });

  it.each([
    ['owned', BRAND_ID],
    ['competitor', COMPETITOR_ID],
    ['previous', COMPETITOR_ID],
    ['current', COMPETITOR_ID],
    ['evaluation', COMPETITOR_ID],
    ['previous_evaluation', COMPETITOR_ID],
  ] as const)('attributes %s signal evidence to its supported subject', (role, subjectId) => {
    const input = fixture();
    const signal = input.context.signals[0]!;
    const observationId = uuid(3000 + input.context.signals.length);
    signal.evidence = [
      {
        ...signal.evidence[0]!,
        role,
        observationId,
      },
    ];
    input.output.hypotheses[0]!.claimReferences.push({
      kind: 'observation',
      observationId,
      subjectId,
      assertion: 'fact',
      claimedEpistemicClass: 'observed',
    });

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
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

  it('preserves stable hypothesis refs after compaction removes an earlier rejected hypothesis', () => {
    const input = fixture();
    const acceptedHypothesis = structuredClone(input.output.hypotheses[0]!);
    acceptedHypothesis.ref = 'h2';
    const rejectedHypothesis = structuredClone(input.output.hypotheses[0]!);
    rejectedHypothesis.ref = 'h1';
    rejectedHypothesis.supportingSignalIds[0] = '00000000-0000-4000-8000-000000009994';
    input.output.hypotheses = [rejectedHypothesis, acceptedHypothesis];
    input.output.experiments[0]!.hypothesisRef = 'h2';
    input.output.executiveBriefing.supportingHypothesisRefs = ['h2'];

    const result = validateIntelligenceSynthesis(input);

    expect(result.status).toBe('partial');
    expect(result.hypotheses.map((item) => item.status)).toEqual(['rejected', 'accepted']);
    expect(result.experiments.map((item) => item.status)).toEqual(['accepted']);
    expect(result.executiveBriefing.status).toBe('accepted');
    expect(result.acceptedOutput.hypotheses.map((hypothesis) => hypothesis.ref)).toEqual(['h2']);
    expect(result.acceptedOutput.experiments.map((experiment) => experiment.hypothesisRef)).toEqual([
      'h2',
    ]);
    expect(result.acceptedOutput.executiveBriefing?.supportingHypothesisRefs).toEqual(['h2']);
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

  it('rejects an independently unknown briefing hypothesis ref', () => {
    const input = fixture();
    input.output.executiveBriefing.supportingHypothesisRefs = ['h5'];

    const result = validateIntelligenceSynthesis(input);

    expect(result.executiveBriefing.status).toBe('rejected');
    expect(result.executiveBriefing.errors.map((error) => error.code)).toContain(
      'INVALID_HYPOTHESIS_REFERENCE',
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

  it('treats a thousands-separated currency amount as one unsupported commercial claim', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'The competitor appears to offer a $1,200 free shipping threshold.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors).toContainEqual(
      expect.objectContaining({
        code: 'UNSUPPORTED_NUMERIC_CLAIM',
        message: 'Prose number 1200 has no matching structured numeric claim',
      }),
    );
  });

  it('accepts a grounded decimal currency amount', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement =
      'rival.test appears to offer a $50.00 free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 50,
        unit: 'usd',
        valueRole: 'competitor',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
  });

  it('normalizes scientific notation before rejecting an unsupported commercial amount', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'The competitor appears to offer a 1e3 usd free shipping threshold.';

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors).toContainEqual(
      expect.objectContaining({
        code: 'UNSUPPORTED_NUMERIC_CLAIM',
        message: 'Prose number 1000 has no matching structured numeric claim',
      }),
    );
  });

  it('checks both endpoints of an unsupported numeric range', () => {
    const input = fixture();
    input.output.hypotheses[0]!.assumptions = [
      'The pilot could run for 3-5 days before interpreting results.',
    ];

    const messages = validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map(
      (error) => error.message,
    );
    expect(messages).toContain('Prose number 3 has no matching structured numeric claim');
    expect(messages).toContain('Prose number 5 has no matching structured numeric claim');
  });

  it('accepts a grounded signed numeric delta', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement =
      'rival.test appears to have a -25 usd lower free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: -25,
        unit: 'usd',
        valueRole: 'delta',
        direction: 'competitor_lower',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
  });

  it('ignores bare calendar years and camel-case product model labels', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'The 2025 iPhone 15 example may be worth testing as generic copy.';

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
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

  it('rejects certainty introduced through a hypothesis uncertainty statement', () => {
    const input = fixture();
    input.output.hypotheses[0]!.uncertainty.statement =
      'The available evidence clearly guarantees the customer outcome.';

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_CAUSAL_CLAIM',
    );
  });

  it.each([
    ['statement', (input: ReturnType<typeof fixture>) => {
      input.output.hypotheses[0]!.statement = 'The competitor clearly drives a guaranteed outcome.';
    }],
    ['rationale', (input: ReturnType<typeof fixture>) => {
      input.output.hypotheses[0]!.rationale =
        'The observed policy results in a proven customer outcome for this competitor.';
    }],
    ['uncertainty statement', (input: ReturnType<typeof fixture>) => {
      input.output.hypotheses[0]!.uncertainty.statement =
        'The policy undoubtedly causes the expected customer outcome.';
    }],
    ['assumption', (input: ReturnType<typeof fixture>) => {
      input.output.hypotheses[0]!.assumptions = [
        'The policy ensures that the commercial outcome occurs.',
      ];
    }],
  ])('rejects unsupported certainty in hypothesis %s prose', (_surface, apply) => {
    const input = fixture();
    apply(input);

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
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

  it.each([
    ['title', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.title = 'Test a policy that clearly drives conversion';
    }],
    ['objective', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.objective =
        'Measure whether the policy leads to a guaranteed customer outcome.';
    }],
    ['hypothesis under test', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.hypothesisUnderTest =
        'The treatment ensures the result is proven for customers.';
    }],
    ['control description', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.design.controlDescription =
        'Keep the policy that results in the current customer outcome.';
    }],
    ['treatment description', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.design.treatmentDescription =
        'Show the treatment that undoubtedly causes a commercial outcome.';
    }],
    ['implementation note', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.implementationNotes[0] =
        'Configure the policy that guarantees the customer outcome.';
    }],
    ['caveat statement', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.caveat.statement =
        'The policy caused a certain customer outcome in this experiment.';
    }],
  ])('rejects unsupported certainty in experiment %s prose', (_surface, apply) => {
    const input = fixture();
    apply(input);

    expect(validateIntelligenceSynthesis(input).experiments[0]!.errors.map((error) => error.code)).toContain(
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

  it.each([
    ['headline', (input: ReturnType<typeof fixture>) => {
      input.output.executiveBriefing.headline = 'Policy clearly drives a commercial outcome';
    }],
    ['strategic posture summary', (input: ReturnType<typeof fixture>) => {
      input.output.executiveBriefing.strategicPostureSummary =
        'The policy ensures the result is proven for this market.';
    }],
    ['key takeaway', (input: ReturnType<typeof fixture>) => {
      input.output.executiveBriefing.keyTakeaway =
        'The policy undoubtedly leads to a guaranteed commercial result.';
    }],
  ])('rejects unsupported certainty in briefing %s prose', (_surface, apply) => {
    const input = fixture();
    apply(input);

    expect(validateIntelligenceSynthesis(input).executiveBriefing.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_BRIEFING_CLAIM',
    );
  });

  it('accepts ordinary uncertain hypothesis language', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'The competitor may be using shipping policy to reduce purchase friction.';
    input.output.hypotheses[0]!.rationale =
      'The evidence could suggest a pattern that appears worth testing.';
    input.output.hypotheses[0]!.uncertainty.statement =
      'The available evidence suggests the effect remains uncertain.';
    input.output.hypotheses[0]!.assumptions = ['This pattern may be worth testing with customers.'];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
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

  it.each([
    ['hypothesis', (input: ReturnType<typeof fixture>) => {
      input.output.hypotheses[0]!.statement =
        'unknown-rival.test may be using shipping policy to reduce purchase friction.';
    }, 'EVIDENCE_DEPENDENCY_MISMATCH'],
    ['experiment', (input: ReturnType<typeof fixture>) => {
      input.output.experiments[0]!.title = 'Test a threshold used by unknown-rival.test';
    }, 'UNSUPPORTED_EXPERIMENT_CLAIM'],
    ['briefing', (input: ReturnType<typeof fixture>) => {
      input.output.executiveBriefing.headline =
        'unknown-rival.test may be reducing purchase friction';
    }, 'UNSUPPORTED_BRIEFING_CLAIM'],
  ])('rejects an out-of-context domain in %s prose', (_surface, apply, expectedCode) => {
    const input = fixture();
    apply(input);
    const result = validateIntelligenceSynthesis(input);
    const errors = [
      ...result.hypotheses.flatMap((hypothesis) => hypothesis.errors),
      ...result.experiments.flatMap((experiment) => experiment.errors),
      ...result.executiveBriefing.errors,
    ];

    expect(errors.map((error) => error.code)).toContain(expectedCode);
  });

  it('accepts owned and known competitor domains in model prose', () => {
    const input = fixture();
    input.output.hypotheses[0]!.statement =
      'rival.test may use shipping policy differently from owned.test.';
    input.output.experiments[0]!.title = 'Test a response to rival.test shipping policy';
    input.output.executiveBriefing.headline = 'rival.test may differ from owned.test on shipping';

    expect(validateIntelligenceSynthesis(input).errors).toEqual([]);
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

  it('grounds numeric content across every experiment prose surface', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    const ownedReference = { ...comparisonReference, subjectId: BRAND_ID };
    const experiment = input.output.experiments[0]!;
    experiment.title = 'Test our $75 free shipping threshold';
    experiment.objective = 'Measure the impact of retaining our $75 shipping threshold.';
    experiment.hypothesisUnderTest =
      'Our $75 shipping threshold may change checkout completion without harming margin.';
    experiment.variableUnderTest = 'shipping_threshold_75';
    experiment.design.controlDescription = 'Keep our $75 shipping threshold for the control.';
    experiment.design.treatmentDescription = 'Change our $75 shipping threshold in treatment.';
    experiment.implementationNotes = [
      'Configure the $75 threshold in the control experience.',
      'Review the $75 threshold before launching the treatment.',
    ];
    experiment.caveat.statement = 'Our $75 shipping threshold may affect shipping subsidy costs.';
    experiment.claimReferences.push(ownedReference);
    experiment.numericClaims = [
      {
        value: 75,
        unit: 'usd',
        valueRole: 'owned',
        reference: ownedReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).experiments[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
  });

  it('rejects an experiment number that is absent from structured numeric claims', () => {
    const input = fixture();
    input.output.experiments[0]!.title = 'Test a $35 free shipping threshold';

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects an experiment that names a domain outside the exact context', () => {
    const input = fixture();
    input.output.experiments[0]!.title = 'Test a threshold used by unknown-rival.test';

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_EXPERIMENT_CLAIM',
    );
  });

  it('rejects an experiment with an invalid structured claim reference', () => {
    const input = fixture();
    input.output.experiments[0]!.claimReferences = [
      {
        kind: 'signal',
        signalId: '00000000-0000-4000-8000-000000009993',
        subjectId: COMPETITOR_ID,
        assertion: 'fact',
        claimedEpistemicClass: 'derived',
      },
    ];

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'UNKNOWN_SIGNAL_ID',
    );
  });

  it.each(['hypotheses', 'experiments'] as const)(
    'keeps a %s cardinality error global',
    (section) => {
    const input = fixture();
    if (section === 'hypotheses') input.output.hypotheses = [];
    else input.output.experiments = [];

    const result = validateIntelligenceSynthesis(input);
    const cardinalityErrors = result.errors.filter(
      (error) => error.code === 'INVALID_OUTPUT_SCHEMA' && error.path.length === 1,
    );

    expect(cardinalityErrors.map((error) => error.path)).toEqual([[section]]);
    },
  );

  it.each([
    ['hypotheses', 6],
    ['experiments', 6],
  ] as const)('rejects more than five %s without per-item cardinality errors', (section, count) => {
    const input = fixture();
    if (section === 'hypotheses') {
      input.output.hypotheses = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(input.output.hypotheses[0]!),
        ref: `h${index + 1}`,
      }));
    } else {
      input.output.experiments = Array.from({ length: count }, () =>
        structuredClone(input.output.experiments[0]!),
      );
    }

    const result = validateIntelligenceSynthesis(input);
    const cardinalityErrors = result.errors.filter(
      (error) => error.code === 'INVALID_OUTPUT_SCHEMA' && error.path.length === 1,
    );

    expect(cardinalityErrors.map((error) => error.path)).toEqual([[section]]);
  });

  it.each([1, 2, 3, 4, 5])('accepts %i individually grounded hypotheses', (count) => {
    const input = fixture();
    input.output.hypotheses = Array.from({ length: count }, (_, index) => ({
      ...structuredClone(input.output.hypotheses[0]!),
      ref: `h${index + 1}`,
    }));

    expect(validateIntelligenceSynthesis(input).errors).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5])('accepts %i individually grounded experiments', (count) => {
    const input = fixture();
    input.output.experiments = Array.from({ length: count }, () =>
      structuredClone(input.output.experiments[0]!),
    );

    expect(validateIntelligenceSynthesis(input).errors).toEqual([]);
  });

  it('rejects prose that attributes an owned numeric claim to the competitor', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement = 'rival.test has a $75 free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 75,
        unit: 'usd',
        valueRole: 'owned',
        reference: { ...comparisonReference, subjectId: BRAND_ID },
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects generic competitor prose backed only by an owned numeric claim', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement = 'The competitor has a $75 free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 75,
        unit: 'usd',
        valueRole: 'owned',
        reference: { ...comparisonReference, subjectId: BRAND_ID },
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects opposite-direction prose for a negative delta', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement =
      'rival.test has a $25 higher free shipping threshold than owned.test.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: -25,
        unit: 'usd',
        valueRole: 'delta',
        direction: 'competitor_lower',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('rejects percentage prose backed only by a USD claim', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement = 'rival.test has a 50% free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 50,
        unit: 'usd',
        valueRole: 'competitor',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it('requires delta direction in the numeric claim schema', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: -25,
        unit: 'usd',
        valueRole: 'delta',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'INVALID_OUTPUT_SCHEMA',
    );
  });

  it('accepts correctly attributed and unit-qualified numeric prose', () => {
    const input = fixture();
    const comparisonReference = input.output.hypotheses[0]!.claimReferences.find(
      (reference) => reference.kind === 'comparison',
    )!;
    input.output.hypotheses[0]!.statement = 'rival.test has a $50 free shipping threshold.';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 50,
        unit: 'usd',
        valueRole: 'competitor',
        reference: comparisonReference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
  });

  it.each(['observed', 'reported'] as const)(
    'handles a %s claim backed by an included untrusted snippet',
    (claimedEpistemicClass) => {
      const input = fixture();
      input.context.untrustedSnippets = [
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
      input.output.hypotheses[0]!.claimReferences.push({
        kind: 'snippet',
        snippetId: 'snip-1',
        subjectId: COMPETITOR_ID,
        assertion: 'fact',
        claimedEpistemicClass,
      });
      input.output.hypotheses[0]!.epistemicClassDependencies.push('reported');

      const result = validateIntelligenceSynthesis(input);

      if (claimedEpistemicClass === 'observed') {
        expect(result.hypotheses[0]!.errors.map((error) => error.code)).toContain(
          'EPISTEMIC_CLASS_VIOLATION',
        );
      } else {
        expect(result.hypotheses[0]).toMatchObject({ status: 'accepted', errors: [] });
      }
    },
  );

  it('rejects duplicate output-local hypothesis refs', () => {
    const input = fixture();
    input.output.hypotheses.push(structuredClone(input.output.hypotheses[0]!));

    const result = validateIntelligenceSynthesis(input);

    expect(result.hypotheses.map((item) => item.status)).toEqual(['rejected', 'rejected']);
    expect(result.hypotheses.flatMap((item) => item.errors).map((error) => error.code)).toContain(
      'INVALID_HYPOTHESIS_REFERENCE',
    );
  });

  it('rejects unknown stable refs from both experiments and briefings', () => {
    const input = fixture();
    input.output.experiments[0]!.hypothesisRef = 'h9';
    input.output.executiveBriefing.supportingHypothesisRefs = ['h9'];

    const result = validateIntelligenceSynthesis(input);

    expect(result.experiments[0]!.errors.map((error) => error.code)).toContain(
      'INVALID_HYPOTHESIS_REFERENCE',
    );
    expect(result.executiveBriefing.errors.map((error) => error.code)).toContain(
      'INVALID_HYPOTHESIS_REFERENCE',
    );
  });

  it('rejects a change-backed claim that selects an unrelated number', () => {
    const { input, reference } = changeFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 11,
        unit: 'usd',
        valueRole: 'previous',
        field: 'threshold',
        reference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
    );
  });

  it.each([
    ['previous', 75, 'usd', undefined],
    ['current', 50, 'usd', undefined],
    ['delta', -25, 'usd', 'decrease'],
  ] as const)('accepts the exact change %s value', (valueRole, value, unit, direction) => {
    const { input, reference } = changeFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value,
        unit,
        valueRole,
        ...(direction ? { direction } : {}),
        field: 'threshold',
        reference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]).toMatchObject({
      status: 'accepted',
      errors: [],
    });
  });

  it.each([
    ['delta', -24, 'decrease'],
    ['delta', -25, 'increase'],
  ] as const)('rejects an incorrect change %s claim', (valueRole, value, direction) => {
    const { input, reference } = changeFixture();
    input.output.hypotheses[0]!.numericClaims = [
      {
        value,
        unit: 'usd',
        valueRole,
        direction,
        field: 'threshold',
        reference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      value === -24 ? 'UNSUPPORTED_NUMERIC_CLAIM' : 'DELTA_DIRECTION_MISMATCH',
    );
  });

  it('rejects a change-backed claim with no resolvable field unit', () => {
    const { input, reference } = changeFixture();
    input.context.recentChanges[0]!.factType = 'positioning.homepage';
    input.output.hypotheses[0]!.numericClaims = [
      {
        value: 75,
        unit: 'usd',
        valueRole: 'previous',
        field: 'threshold',
        reference,
      },
    ];

    expect(validateIntelligenceSynthesis(input).hypotheses[0]!.errors.map((error) => error.code)).toContain(
      'UNSUPPORTED_NUMERIC_CLAIM',
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
