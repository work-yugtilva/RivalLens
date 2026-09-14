import { describe, expect, it } from 'vitest';
import { loadGateConfigFromDisk } from '../../packages/eval/src/config/gates';
import { evaluateEligibility } from '../../packages/eval/src/gates/eligibility';
import { rate, type ModelAggregate } from '../../packages/eval/src/metrics/aggregate';

const CONFIG = loadGateConfigFromDisk();

function aggregate(overrides: Partial<ModelAggregate> = {}): ModelAggregate {
  return {
    providerId: 'openai',
    modelId: 'm1',
    modelAlias: 'openai-candidate',
    runCount: 45,
    eligibleRunCount: 45,
    fixtureCount: 15,
    groundingPassRate: rate(45, 45),
    groundingPassOrPartialRate: rate(45, 45),
    unknownIdCitationRate: rate(0, 45),
    numericPrecision: 1,
    competitorAttributionAccuracy: 1,
    epistemicComplianceRate: 1,
    meanAcceptedHypotheses: 2,
    meanAcceptedExperiments: 2,
    totalUnknownAsAbsenceCount: 0,
    structuredOutputSuccessRate: rate(45, 45),
    repairRate: rate(0, 45),
    transportRetryRate: rate(0, 45),
    fallbackRate: rate(0, 45),
    meanProviderInvocationCount: 1,
    adversarialRunCount: 15,
    injectionDefenseFailureRate: rate(0, 15),
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    latency: {
      firstAttemptModelMs: { n: 45, p50: 5, p95: 9, mean: 5 },
      repairMs: { n: 0, p50: null, p95: null, mean: null },
      totalOrchestrationMs: { n: 45, p50: 6, p95: 10, mean: 6 },
    },
    ...overrides,
  };
}

describe('hard eligibility gates', () => {
  it('a clean model is eligible', () => {
    const result = evaluateEligibility(aggregate(), CONFIG);
    expect(result.eligible).toBe(true);
    expect(result.gates.every((gate) => gate.passed)).toBe(true);
    expect(result.gatesVersion).toBe('phase-4a-gates-v1');
  });

  it('a single unknown-evidence citation makes the model INELIGIBLE', () => {
    const result = evaluateEligibility(
      aggregate({ unknownIdCitationRate: rate(1, 45) }),
      CONFIG,
    );
    expect(result.eligible).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'unknownEvidenceCitationGate')!.passed).toBe(false);
  });

  it('attribution accuracy below 100% is INELIGIBLE', () => {
    const result = evaluateEligibility(
      aggregate({ competitorAttributionAccuracy: 44 / 45 }),
      CONFIG,
    );
    expect(result.eligible).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'competitorAttributionGate')!.passed).toBe(false);
  });

  it('a single unknown-as-absence violation is INELIGIBLE', () => {
    const result = evaluateEligibility(aggregate({ totalUnknownAsAbsenceCount: 1 }), CONFIG);
    expect(result.eligible).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'unknownAsAbsenceGate')!.passed).toBe(false);
  });

  it('any injection / trust-boundary failure is INELIGIBLE regardless of everything else', () => {
    const result = evaluateEligibility(
      aggregate({ injectionDefenseFailureRate: rate(1, 15) }),
      CONFIG,
    );
    expect(result.eligible).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'injectionTrustBoundaryGate')!.passed).toBe(false);
  });

  it('a model with zero eligible runs cannot be certified', () => {
    const result = evaluateEligibility(
      aggregate({
        eligibleRunCount: 0,
        groundingPassRate: rate(0, 0),
        unknownIdCitationRate: rate(0, 0),
        numericPrecision: null,
        competitorAttributionAccuracy: null,
        epistemicComplianceRate: null,
      }),
      CONFIG,
    );
    expect(result.eligible).toBe(false);
    expect(result.gates.find((gate) => gate.id === 'hasEligibleOutputGate')!.passed).toBe(false);
  });

  it('the injection gate passes vacuously when no adversarial fixtures were run', () => {
    const result = evaluateEligibility(
      aggregate({ adversarialRunCount: 0, injectionDefenseFailureRate: rate(0, 0) }),
      CONFIG,
    );
    expect(result.gates.find((gate) => gate.id === 'injectionTrustBoundaryGate')!.passed).toBe(true);
  });
});
