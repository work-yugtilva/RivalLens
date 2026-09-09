import type {
  IntelligenceContext,
  LlmIntelligenceSynthesisOutput,
} from '@rivallens/schemas';
import type { z } from 'zod';
import {
  IntelligenceProviderError,
  type DeepReadonly,
  type IntelligenceModelProvider,
  type IntelligenceRequest,
  type IntelligenceResponse,
} from './provider';

export type DeterministicMockScenario =
  | 'valid'
  | 'malformed_schema'
  | 'unknown_evidence_id'
  | 'invented_experiment_number'
  | 'numeric_role_laundering'
  | 'wrong_numeric_unit'
  | 'wrong_delta_direction'
  | 'snippet_observed_promotion'
  | 'unknown_hypothesis_ref'
  | 'duplicate_hypothesis_refs'
  | 'invalid_hypothesis_with_dependent_experiment'
  | 'partial_stable_refs'
  | 'decoy_change_field'
  | 'empty_hypotheses'
  | 'over_limit_hypotheses'
  | 'unsupported_briefing_claim'
  | 'provider_exception'
  | 'timeout';

function validOutput(
  context: DeepReadonly<IntelligenceContext>,
): LlmIntelligenceSynthesisOutput {
  const competitor = context.competitors[0];
  const signal = context.signals[0];
  if (!competitor || !signal) {
    throw new IntelligenceProviderError(
      'provider_exception',
      'The deterministic mock requires one competitor and one signal',
    );
  }

  const comparisonReference = {
    kind: 'comparison' as const,
    comparisonKey: signal.comparisonKey,
    competitorId: competitor.id,
    subjectId: competitor.id,
    assertion: 'fact' as const,
    claimedEpistemicClass: 'observed' as const,
  };
  const signalReference = {
    kind: 'signal' as const,
    signalId: signal.id,
    subjectId: competitor.id,
    assertion: 'fact' as const,
    claimedEpistemicClass: 'derived' as const,
  };

  return {
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
        competitorId: competitor.id,
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
        competitorId: competitor.id,
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
  };
}

export class DeterministicMockIntelligenceProvider implements IntelligenceModelProvider {
  readonly providerId = 'deterministic-mock';
  readonly modelId = 'phase-3a';

  constructor(readonly scenario: DeterministicMockScenario) {}

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: IntelligenceRequest<TSchema>,
  ): Promise<IntelligenceResponse> {
    if (this.scenario === 'provider_exception') {
      throw new IntelligenceProviderError('provider_exception', 'Mock provider exception');
    }
    if (this.scenario === 'timeout') {
      throw new IntelligenceProviderError('timeout', 'Mock provider timeout');
    }

    const rawOutput = this.scenarioOutput(request.context);
    return {
      rawOutput,
      telemetry: {
        providerId: this.providerId,
        modelId: this.modelId,
        latencyMs: 1,
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0,
        rawResponseId: 'mock-response-1',
        finishReason: 'stop',
      },
    };
  }

  private scenarioOutput(context: DeepReadonly<IntelligenceContext>): unknown {
    if (this.scenario === 'malformed_schema') {
      return { hypotheses: 'invalid' };
    }

    const output = validOutput(context);
    const hypothesis = output.hypotheses[0]!;
    const experiment = output.experiments[0]!;
    const comparisonReference = hypothesis.claimReferences[0]!;

    switch (this.scenario) {
      case 'valid':
        return output;
      case 'unknown_evidence_id':
        hypothesis.supportingSignalIds = ['00000000-0000-4000-8000-000000009999'];
        return output;
      case 'invented_experiment_number':
        experiment.title = 'Test a $35 free shipping threshold';
        return output;
      case 'numeric_role_laundering':
        hypothesis.numericClaims = [
          {
            value: 75,
            unit: 'usd',
            valueRole: 'owned',
            reference: comparisonReference,
          },
        ];
        return output;
      case 'wrong_numeric_unit':
        hypothesis.numericClaims = [
          {
            value: 50,
            unit: 'days',
            valueRole: 'competitor',
            reference: comparisonReference,
          },
        ];
        return output;
      case 'wrong_delta_direction':
        hypothesis.numericClaims = [
          {
            value: -25,
            unit: 'usd',
            valueRole: 'delta',
            direction: 'competitor_higher',
            reference: comparisonReference,
          },
        ];
        return output;
      case 'snippet_observed_promotion': {
        const snippet = context.untrustedSnippets[0];
        if (!snippet) {
          throw new IntelligenceProviderError(
            'provider_exception',
            'The snippet scenario requires an untrusted snippet',
          );
        }
        hypothesis.claimReferences.push({
          kind: 'snippet',
          snippetId: snippet.snippetId,
          subjectId: snippet.subjectId,
          assertion: 'fact',
          claimedEpistemicClass: 'observed',
        });
        hypothesis.epistemicClassDependencies.push('reported');
        return output;
      }
      case 'unknown_hypothesis_ref':
        experiment.hypothesisRef = 'h9';
        output.executiveBriefing.supportingHypothesisRefs = ['h9'];
        return output;
      case 'duplicate_hypothesis_refs':
        output.hypotheses.push(structuredClone(hypothesis));
        return output;
      case 'invalid_hypothesis_with_dependent_experiment':
        hypothesis.supportingSignalIds = ['00000000-0000-4000-8000-000000009998'];
        return output;
      case 'partial_stable_refs': {
        const acceptedHypothesis = structuredClone(hypothesis);
        acceptedHypothesis.ref = 'h2';
        const rejectedHypothesis = structuredClone(hypothesis);
        rejectedHypothesis.supportingSignalIds = ['00000000-0000-4000-8000-000000009997'];
        output.hypotheses = [rejectedHypothesis, acceptedHypothesis];
        experiment.hypothesisRef = 'h2';
        output.executiveBriefing.supportingHypothesisRefs = ['h2'];
        return output;
      }
      case 'decoy_change_field': {
        const change = context.recentChanges[0];
        if (!change) {
          throw new IntelligenceProviderError(
            'provider_exception',
            'The decoy scenario requires an observed change',
          );
        }
        hypothesis.numericClaims = [
          {
            value: 11,
            unit: 'usd',
            valueRole: 'previous',
            field: 'threshold',
            reference: {
              kind: 'change',
              changeId: change.id,
              subjectId: change.subjectId,
              assertion: 'fact',
              claimedEpistemicClass: 'derived',
            },
          },
        ];
        return output;
      }
      case 'empty_hypotheses':
        output.hypotheses = [];
        return output;
      case 'over_limit_hypotheses':
        output.hypotheses = Array.from({ length: 6 }, (_, index) => ({
          ...structuredClone(hypothesis),
          ref: `h${index + 1}`,
        }));
        return output;
      case 'unsupported_briefing_claim':
        output.executiveBriefing.strategicPostureSummary =
          'The competitor policy proves that conversion will increase for the rival business.';
        return output;
      case 'provider_exception':
      case 'timeout':
        throw new Error(`Unexpected mock scenario ${this.scenario}`);
    }
  }
}
