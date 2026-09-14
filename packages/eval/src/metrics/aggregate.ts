import { summarizeLatencySeries, mean as meanOf, type LatencySummary } from './latency';
import type { PerRunMetrics } from './perRun';
import type { TrustBoundaryOutcome } from '../gates/trustBoundary';

export type Ratio = {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
};

export function rate(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

function complement(ratio: Ratio): number | null {
  return ratio.rate === null ? null : 1 - ratio.rate;
}

export type RunForAggregate = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelAlias: string;
  readonly fixtureId: string;
  readonly adversarial: boolean;
  readonly metrics: PerRunMetrics;
  readonly trustBoundary: TrustBoundaryOutcome;
};

export type TokenUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
};

export type ModelAggregate = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelAlias: string;
  readonly runCount: number;
  readonly eligibleRunCount: number;
  readonly fixtureCount: number;
  // Quality view (denominator = model-quality-eligible runs)
  readonly groundingPassRate: Ratio;
  readonly groundingPassOrPartialRate: Ratio;
  readonly unknownIdCitationRate: Ratio;
  readonly numericPrecision: number | null;
  readonly competitorAttributionAccuracy: number | null;
  readonly epistemicComplianceRate: number | null;
  readonly meanAcceptedHypotheses: number | null;
  readonly meanAcceptedExperiments: number | null;
  // Reliability / throughput view (denominator = all runs)
  readonly totalUnknownAsAbsenceCount: number;
  readonly structuredOutputSuccessRate: Ratio;
  readonly repairRate: Ratio;
  readonly transportRetryRate: Ratio;
  readonly fallbackRate: Ratio;
  readonly meanProviderInvocationCount: number | null;
  // Trust boundary
  readonly adversarialRunCount: number;
  readonly injectionDefenseFailureRate: Ratio;
  // Cost inputs / latency
  readonly tokenUsage: TokenUsage;
  readonly latency: {
    readonly firstAttemptModelMs: LatencySummary;
    readonly repairMs: LatencySummary;
    readonly totalOrchestrationMs: LatencySummary;
  };
};

function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

function computeAggregate(
  identity: { providerId: string; modelId: string; modelAlias: string },
  runs: readonly RunForAggregate[],
): ModelAggregate {
  const all = runs;
  const eligible = runs.filter((run) => run.metrics.modelQualityEligible);
  const adversarial = runs.filter((run) => run.adversarial);

  const passed = eligible.filter((run) => run.metrics.validatorStatus === 'passed').length;
  const passedOrPartial = eligible.filter(
    (run) => run.metrics.validatorStatus === 'passed' || run.metrics.validatorStatus === 'partial',
  ).length;
  const unknownIdRuns = eligible.filter((run) => run.metrics.unknownEvidenceReferenceCount > 0).length;
  const numericBadRuns = eligible.filter((run) => run.metrics.unsupportedNumericClaimCount > 0).length;
  const attributionBadRuns = eligible.filter(
    (run) => run.metrics.competitorAttributionErrorCount > 0,
  ).length;
  const epistemicBadRuns = eligible.filter(
    (run) => run.metrics.epistemicViolationCount > 0 || run.metrics.unknownAsAbsenceCount > 0,
  ).length;

  const injectionFailures = adversarial.filter(
    (run) => run.trustBoundary.outcome === 'defense_failure',
  ).length;

  return {
    ...identity,
    runCount: all.length,
    eligibleRunCount: eligible.length,
    fixtureCount: new Set(all.map((run) => run.fixtureId)).size,
    groundingPassRate: rate(passed, eligible.length),
    groundingPassOrPartialRate: rate(passedOrPartial, eligible.length),
    unknownIdCitationRate: rate(unknownIdRuns, eligible.length),
    numericPrecision: complement(rate(numericBadRuns, eligible.length)),
    competitorAttributionAccuracy: complement(rate(attributionBadRuns, eligible.length)),
    epistemicComplianceRate: complement(rate(epistemicBadRuns, eligible.length)),
    meanAcceptedHypotheses: meanOf(
      eligible.map((run) => run.metrics.acceptedHypothesisCount ?? 0),
    ),
    meanAcceptedExperiments: meanOf(
      eligible.map((run) => run.metrics.acceptedExperimentCount ?? 0),
    ),
    totalUnknownAsAbsenceCount: all.reduce(
      (sum, run) => sum + run.metrics.unknownAsAbsenceCount,
      0,
    ),
    structuredOutputSuccessRate: rate(
      all.filter((run) => run.metrics.schemaValid && run.metrics.validatorStatus !== null).length,
      all.length,
    ),
    repairRate: rate(all.filter((run) => run.metrics.repairTriggered).length, all.length),
    transportRetryRate: rate(
      all.filter((run) => run.metrics.transportRetryTriggered).length,
      all.length,
    ),
    fallbackRate: rate(all.filter((run) => run.metrics.fallbackTriggered).length, all.length),
    meanProviderInvocationCount: meanOf(all.map((run) => run.metrics.providerInvocationCount)),
    adversarialRunCount: adversarial.length,
    injectionDefenseFailureRate: rate(injectionFailures, adversarial.length),
    tokenUsage: {
      inputTokens: sumOrNull(all.map((run) => run.metrics.inputTokens)),
      outputTokens: sumOrNull(all.map((run) => run.metrics.outputTokens)),
      totalTokens: sumOrNull(all.map((run) => run.metrics.totalTokens)),
    },
    latency: {
      firstAttemptModelMs: summarizeLatencySeries(
        all
          .map((run) => run.metrics.timings.firstAttemptMs)
          .filter((value): value is number => value !== null),
      ),
      repairMs: summarizeLatencySeries(
        all
          .map((run) => run.metrics.timings.repairMs)
          .filter((value): value is number => value !== null),
      ),
      totalOrchestrationMs: summarizeLatencySeries(all.map((run) => run.metrics.timings.wallClockMs)),
    },
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item)) ?? [];
    bucket.push(item);
    groups.set(key(item), bucket);
  }
  return groups;
}

export function aggregateByModel(runs: readonly RunForAggregate[]): ModelAggregate[] {
  const groups = groupBy(runs, (run) => `${run.providerId}::${run.modelId}`);
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, groupRuns]) =>
      computeAggregate(
        {
          providerId: groupRuns[0]!.providerId,
          modelId: groupRuns[0]!.modelId,
          modelAlias: groupRuns[0]!.modelAlias,
        },
        groupRuns,
      ),
    );
}

export function aggregateByProvider(runs: readonly RunForAggregate[]): ModelAggregate[] {
  const groups = groupBy(runs, (run) => run.providerId);
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([providerId, groupRuns]) =>
      computeAggregate({ providerId, modelId: '(all)', modelAlias: '(all)' }, groupRuns),
    );
}
