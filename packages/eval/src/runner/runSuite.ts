import type {
  AttemptDebugInfo,
  IntelligenceModelParameters,
  IntelligenceModelProvider,
  ReasoningEffort,
} from '@rivallens/ai';
import { EVALUATION_VERSION } from '../config/evaluationVersion';
import type { ModelConfigEntry } from '../config/models';
import type { FrozenFixture } from '../fixtures/schema';
import { aggregateByModel, aggregateByProvider, type ModelAggregate, type RunForAggregate } from '../metrics/aggregate';
import { extractPerRunMetrics, type PerRunMetrics } from '../metrics/perRun';
import { classifyTrustBoundaryOutcome, type TrustBoundaryOutcome } from '../gates/trustBoundary';
import { evaluateEligibility, type EligibilityResult } from '../gates/eligibility';
import type { GateConfig } from '../config/gates';
import { estimatedCostPerRun, resolvePricing, type PricingTable } from '../pricing/pricing';
import { writeRawAttemptCapture } from '../report/rawCapture';
import { runFixtureModel, type EvaluationAttemptSummary } from './runFixtureModel';

export type BenchmarkMode = 'mock' | 'live';

export type BenchmarkRunRecord = {
  readonly runId: string;
  readonly benchmarkRunId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelAlias: string;
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly contextHash: string;
  readonly runIndex: number;
  readonly mode: BenchmarkMode;
  readonly status: string;
  readonly fallbackReason: string | null;
  readonly terminalValidatorStatus: string | null;
  // Safe per-attempt telemetry only. Never raw model output, prompt text, or competitor text.
  readonly attempts: EvaluationAttemptSummary[];
  readonly perRunMetrics: PerRunMetrics;
  readonly trustBoundary: TrustBoundaryOutcome;
  readonly wallClockMs: number;
  readonly firstAttemptMs: number | null;
  readonly repairMs: number | null;
  readonly estimatedCostUsd: number | null;
  // Model parameters actually applied to the provider request for this run.
  readonly reasoningEffort: ReasoningEffort | null;
  readonly appliedMaxOutputTokens: number;
  readonly appliedTemperature: number | null;
  readonly subjectiveScores: null;
};

export type BenchmarkManifest = {
  readonly benchmarkRunId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly mode: BenchmarkMode;
  readonly evaluationVersion: typeof EVALUATION_VERSION;
  readonly pricingVersion: string;
  readonly models: Array<
    Pick<
      ModelConfigEntry,
      | 'alias'
      | 'providerId'
      | 'modelId'
      | 'temperature'
      | 'maxOutputTokens'
      | 'runsPerFixture'
      | 'supportedReasoningEfforts'
      | 'structuredOutputMode'
      | 'temperatureSupported'
    > & { readonly reasoningEffort: ReasoningEffort | null }
  >;
  readonly fixtureIds: string[];
  readonly runsPerFixture: number | null;
  readonly totalRuns: number;
  readonly gitCommit: string | null;
};

export type ModelReport = {
  readonly aggregate: ModelAggregate;
  readonly eligibility: EligibilityResult;
};

export type BenchmarkResult = {
  readonly manifest: BenchmarkManifest;
  readonly runs: BenchmarkRunRecord[];
  readonly modelReports: ModelReport[];
  readonly providerAggregates: ModelAggregate[];
};

export type SuiteRunInput = {
  readonly benchmarkRunId: string;
  readonly mode: BenchmarkMode;
  readonly fixtures: readonly FrozenFixture[];
  readonly models: readonly ModelConfigEntry[];
  readonly runsPerFixtureOverride?: number;
  readonly reasoningEffortByAlias?: Record<string, ReasoningEffort | null>;
  readonly mockScenarioOverride?: string;
  readonly makeProvider: (
    model: ModelConfigEntry,
    fixture: FrozenFixture,
  ) => IntelligenceModelProvider;
  readonly pricing: PricingTable;
  readonly pricingDate: string;
  readonly gateConfig: GateConfig;
  readonly gitCommit?: string | null;
  readonly now?: () => string;
  // Opt-in, eval/debug-only. When both are set, each successful provider attempt's raw
  // output + full validation detail is persisted under `rawDir` (see report/rawCapture.ts).
  // Never populated by default; does not affect runs/manifest/aggregates.
  readonly captureRaw?: boolean;
  readonly rawDir?: string;
};

export async function runSuite(input: SuiteRunInput): Promise<BenchmarkResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const runs: BenchmarkRunRecord[] = [];
  const forAggregate: RunForAggregate[] = [];

  for (const model of input.models) {
    const runsPerFixture = input.runsPerFixtureOverride ?? model.runsPerFixture;
    const pricingEntry = resolvePricing(
      input.pricing,
      model.providerId,
      model.modelId,
      input.pricingDate,
    );

    const reasoningEffort =
      input.reasoningEffortByAlias?.[model.alias] ?? model.reasoningEffort ?? null;
    const appliedTemperature =
      model.temperature !== undefined && model.temperatureSupported ? model.temperature : null;
    const parameters: IntelligenceModelParameters = {
      maxOutputTokens: model.maxOutputTokens,
      ...(appliedTemperature === null ? {} : { temperature: appliedTemperature }),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };

    for (const fixture of input.fixtures) {
      for (let runIndex = 1; runIndex <= runsPerFixture; runIndex += 1) {
        const runId = `${input.benchmarkRunId}--${model.alias}--${fixture.fixtureId}--${runIndex}`;
        const provider = input.makeProvider(model, fixture);
        const onAttemptDebug =
          input.captureRaw && input.rawDir
            ? (attempt: AttemptDebugInfo): void => {
                try {
                  writeRawAttemptCapture(
                    input.rawDir!,
                    {
                      runId,
                      fixtureId: fixture.fixtureId,
                      modelAlias: model.alias,
                      providerId: model.providerId,
                      runIndex,
                    },
                    attempt,
                  );
                } catch (error) {
                  process.stderr.write(
                    `WARNING: Failed to write raw attempt capture: ${error instanceof Error ? error.message : String(error)}\n`,
                  );
                }
              }
            : undefined;
        const { result, attempts, timings } = await runFixtureModel({
          fixture,
          provider,
          parameters,
          ...(onAttemptDebug ? { onAttemptDebug } : {}),
        });
        const perRunMetrics = extractPerRunMetrics(result, attempts, timings);
        const trustBoundary = classifyTrustBoundaryOutcome(fixture, perRunMetrics, result);
        const estimatedCostUsd = estimatedCostPerRun(
          attempts.map((attempt) => ({
            inputTokens: attempt.telemetry?.inputTokens ?? null,
            outputTokens: attempt.telemetry?.outputTokens ?? null,
          })),
          pricingEntry,
        );

        runs.push({
          runId,
          benchmarkRunId: input.benchmarkRunId,
          providerId: model.providerId,
          modelId: model.modelId,
          modelAlias: model.alias,
          fixtureId: fixture.fixtureId,
          fixtureVersion: fixture.fixtureVersion,
          contextHash: fixture.contextHash,
          runIndex,
          mode: input.mode,
          status: result.status,
          fallbackReason:
            result.status === 'deterministic_fallback' ? result.fallbackReason : null,
          terminalValidatorStatus: perRunMetrics.validatorStatus,
          attempts,
          perRunMetrics,
          trustBoundary,
          wallClockMs: timings.wallClockMs,
          firstAttemptMs: timings.firstAttemptMs,
          repairMs: timings.repairMs,
          estimatedCostUsd,
          reasoningEffort,
          appliedMaxOutputTokens: model.maxOutputTokens,
          appliedTemperature,
          subjectiveScores: null,
        });

        forAggregate.push({
          providerId: model.providerId,
          modelId: model.modelId,
          modelAlias: model.alias,
          fixtureId: fixture.fixtureId,
          adversarial: fixture.adversarial,
          metrics: perRunMetrics,
          trustBoundary,
        });
      }
    }
  }

  const modelReports = aggregateByModel(forAggregate).map((aggregate) => ({
    aggregate,
    eligibility: evaluateEligibility(aggregate, input.gateConfig),
  }));

  const finishedAt = now();
  const uniformRunsPerFixture =
    input.runsPerFixtureOverride ??
    (new Set(input.models.map((model) => model.runsPerFixture)).size === 1
      ? (input.models[0]?.runsPerFixture ?? null)
      : null);

  return {
    manifest: {
      benchmarkRunId: input.benchmarkRunId,
      startedAt,
      finishedAt,
      mode: input.mode,
      evaluationVersion: EVALUATION_VERSION,
      pricingVersion: input.pricing.pricingVersion,
      models: input.models.map((model) => ({
        alias: model.alias,
        providerId: model.providerId,
        modelId: model.modelId,
        temperature: model.temperature,
        maxOutputTokens: model.maxOutputTokens,
        runsPerFixture: input.runsPerFixtureOverride ?? model.runsPerFixture,
        supportedReasoningEfforts: model.supportedReasoningEfforts,
        structuredOutputMode: model.structuredOutputMode,
        temperatureSupported: model.temperatureSupported,
        reasoningEffort:
          input.reasoningEffortByAlias?.[model.alias] ?? model.reasoningEffort ?? null,
      })),
      fixtureIds: input.fixtures.map((fixture) => fixture.fixtureId),
      runsPerFixture: uniformRunsPerFixture,
      totalRuns: runs.length,
      gitCommit: input.gitCommit ?? null,
    },
    runs,
    modelReports,
    providerAggregates: aggregateByProvider(forAggregate),
  };
}
