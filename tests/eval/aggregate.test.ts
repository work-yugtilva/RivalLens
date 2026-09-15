import { describe, expect, it } from 'vitest';
import {
  aggregateByModel,
  aggregateByProvider,
  rate,
  type RunForAggregate,
} from '../../packages/eval/src/metrics/aggregate';
import type { PerRunMetrics } from '../../packages/eval/src/metrics/perRun';

function metrics(overrides: Partial<PerRunMetrics> = {}): PerRunMetrics {
  return {
    schemaValid: true,
    validatorStatus: 'passed',
    unknownEvidenceReferenceCount: 0,
    unsupportedNumericClaimCount: 0,
    competitorAttributionErrorCount: 0,
    epistemicViolationCount: 0,
    unknownAsAbsenceCount: 0,
    unsupportedCausalClaimCount: 0,
    acceptedHypothesisCount: 2,
    acceptedExperimentCount: 2,
    executiveBriefingAccepted: true,
    fallbackTriggered: false,
    fallbackReason: null,
    repairTriggered: false,
    transportRetryTriggered: false,
    providerInvocationCount: 1,
    modelQualityEligible: true,
    fallbackAcceptedHypothesisCount: null,
    fallbackAcceptedExperimentCount: null,
    providerFailureCode: null,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    timings: { wallClockMs: 10, firstAttemptMs: 5, repairMs: null },
    ...overrides,
  };
}

function run(overrides: Partial<RunForAggregate> = {}): RunForAggregate {
  return {
    providerId: 'openai',
    modelId: 'm1',
    modelAlias: 'openai-candidate',
    fixtureId: 'b-shipping-threshold-diff',
    adversarial: false,
    metrics: metrics(),
    trustBoundary: { outcome: 'not_applicable' },
    ...overrides,
  };
}

describe('rate()', () => {
  it('is lossless and returns null for a zero denominator', () => {
    expect(rate(3, 40)).toEqual({ numerator: 3, denominator: 40, rate: 0.075 });
    expect(rate(0, 0)).toEqual({ numerator: 0, denominator: 0, rate: null });
  });
});

describe('aggregateByModel', () => {
  it('separates a quality view (eligible runs) from a reliability view (all runs)', () => {
    const runs: RunForAggregate[] = [
      run(),
      run({ metrics: metrics({ validatorStatus: 'partial' }) }),
      run({
        fixtureId: 'i-sparse-evidence',
        metrics: metrics({
          modelQualityEligible: false,
          fallbackTriggered: true,
          fallbackReason: 'PROVIDER_RETRY_EXHAUSTED',
          acceptedHypothesisCount: null,
          acceptedExperimentCount: null,
          validatorStatus: null,
          schemaValid: false,
        }),
      }),
    ];
    const [model] = aggregateByModel(runs);
    expect(model!.runCount).toBe(3);
    expect(model!.eligibleRunCount).toBe(2);
    // grounding pass rate uses the eligible denominator, NOT all runs
    expect(model!.groundingPassRate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(model!.groundingPassOrPartialRate.rate).toBe(1);
    // reliability rates use all runs
    expect(model!.fallbackRate).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(model!.structuredOutputSuccessRate).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  it('excludes fallback runs from model-quality means', () => {
    const runs: RunForAggregate[] = [
      run({ metrics: metrics({ acceptedHypothesisCount: 3 }) }),
      run({
        metrics: metrics({ modelQualityEligible: false, fallbackTriggered: true, acceptedHypothesisCount: null }),
      }),
    ];
    const [model] = aggregateByModel(runs);
    expect(model!.meanAcceptedHypotheses).toBe(3);
    expect(model!.fallbackRate.rate).toBe(0.5);
  });

  it('computes numeric precision / attribution accuracy as complements over eligible runs', () => {
    const runs: RunForAggregate[] = [
      run(),
      run(),
      run({ metrics: metrics({ unsupportedNumericClaimCount: 1 }) }),
      run({ metrics: metrics({ competitorAttributionErrorCount: 2 }) }),
    ];
    const [model] = aggregateByModel(runs);
    expect(model!.numericPrecision).toBe(0.75);
    expect(model!.competitorAttributionAccuracy).toBe(0.75);
  });

  it('computes injection-defense failure rate over adversarial runs only', () => {
    const runs: RunForAggregate[] = [
      run(),
      run({ adversarial: true, trustBoundary: { outcome: 'ok' } }),
      run({ adversarial: true, trustBoundary: { outcome: 'defense_failure', reasons: ['x'] } }),
    ];
    const [model] = aggregateByModel(runs);
    expect(model!.adversarialRunCount).toBe(2);
    expect(model!.injectionDefenseFailureRate).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it('groups by model and by provider', () => {
    const runs: RunForAggregate[] = [
      run({ providerId: 'openai', modelId: 'm1' }),
      run({ providerId: 'openai', modelId: 'm2' }),
      run({ providerId: 'anthropic', modelId: 'm3' }),
    ];
    expect(aggregateByModel(runs).map((m) => `${m.providerId}:${m.modelId}`)).toEqual([
      'anthropic:m3',
      'openai:m1',
      'openai:m2',
    ]);
    expect(aggregateByProvider(runs).map((m) => m.providerId)).toEqual(['anthropic', 'openai']);
    expect(aggregateByProvider(runs).find((m) => m.providerId === 'openai')!.runCount).toBe(2);
  });

  it('nullifies token usage when any run lacks telemetry', () => {
    const runs: RunForAggregate[] = [
      run(),
      run({ metrics: metrics({ inputTokens: null }) }),
    ];
    const [model] = aggregateByModel(runs);
    expect(model!.tokenUsage.inputTokens).toBeNull();
    expect(model!.tokenUsage.outputTokens).toBe(400);
  });
});
