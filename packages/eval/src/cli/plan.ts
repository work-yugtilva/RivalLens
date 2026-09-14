import { canonicalContext } from '@rivallens/intelligence';
import { EVALUATION_VERSION } from '../config/evaluationVersion';
import { requireKeysForProviders, type EvalLiveEnv } from '../config/env';
import {
  LIVE_PROVIDER_IDS,
  assertLiveModelReady,
  assertModelIsTrusted,
  assertReasoningEffortSupported,
  selectModels,
  type LiveProviderId,
  type ModelConfig,
  type ModelConfigEntry,
} from '../config/models';
import type { ReasoningEffort } from '@rivallens/ai';
import type { FrozenFixture } from '../fixtures/schema';
import { costForAttempt, resolvePricing, type PricingTable } from '../pricing/pricing';
import { MAX_PROVIDER_INVOCATIONS } from '@rivallens/ai';
import { selectFixturesByToken, type EvalArgs } from './args';

export type RunPlan = {
  readonly mode: 'mock' | 'live';
  readonly benchmarkRunId: string;
  readonly outDir: string;
  readonly models: ModelConfigEntry[];
  readonly fixtures: FrozenFixture[];
  readonly runsPerFixtureByAlias: Record<string, number>;
  readonly reasoningEffortByAlias: Record<string, ReasoningEffort | null>;
  readonly plannedOrchestrations: number;
  readonly providerCallUpperBound: number;
  readonly estimatedMaxCostUsd: number | null;
  readonly estimatedMaxCostUnknownFor: string[];
  readonly pricingDate: string;
  readonly liveKeys: Record<LiveProviderId, string> | null;
};

export type PlanDeps = {
  readonly modelConfig: ModelConfig;
  readonly pricing: PricingTable;
  readonly fixtures: readonly FrozenFixture[];
  readonly env?: EvalLiveEnv | Record<string, string | undefined>;
  readonly now?: Date;
};

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function inputTokenEstimate(fixture: FrozenFixture): number {
  return Math.ceil(Buffer.byteLength(canonicalContext(fixture.context), 'utf8') / 4);
}

export function planRun(args: EvalArgs, deps: PlanDeps): RunPlan {
  const now = deps.now ?? new Date();
  const mode: 'mock' | 'live' = args.live && !args.dryRun ? 'live' : args.live ? 'live' : 'mock';

  // --models is an explicit trusted-alias selection. With no --models, the default depends
  // on mode: MOCK runs the deterministic-mock model(s); LIVE runs the real candidates.
  const models =
    args.models.length > 0
      ? selectModels(deps.modelConfig, args.models)
      : deps.modelConfig.models.filter((model) =>
          args.live ? model.providerId !== 'deterministic-mock' : model.providerId === 'deterministic-mock',
        );
  if (models.length === 0) {
    throw new Error(
      args.live
        ? 'no live candidate models configured. Add real modelIds to packages/eval/config/models.json.'
        : 'no deterministic-mock model configured in packages/eval/config/models.json.',
    );
  }
  for (const model of models) assertModelIsTrusted(model, deps.modelConfig);
  const fixtures = selectFixturesByToken(deps.fixtures, args.fixtures);

  // Resolve reasoning-effort per model (CLI override > per-model config > provider default)
  // and reject an unsupported level BEFORE any provider is constructed or any call is made.
  const reasoningEffortByAlias: Record<string, ReasoningEffort | null> = {};
  for (const model of models) {
    const effort = args.reasoningEffort ?? model.reasoningEffort ?? null;
    if (effort) assertReasoningEffortSupported(model, effort);
    reasoningEffortByAlias[model.alias] = effort;
  }

  const runsPerFixtureByAlias: Record<string, number> = {};
  let plannedOrchestrations = 0;
  for (const model of models) {
    const runs = args.runs ?? model.runsPerFixture;
    runsPerFixtureByAlias[model.alias] = runs;
    plannedOrchestrations += runs * fixtures.length;
  }
  const providerCallUpperBound = plannedOrchestrations * MAX_PROVIDER_INVOCATIONS;

  const pricingDate = now.toISOString().slice(0, 10);
  const unknownFor: string[] = [];
  let maxCost = 0;
  for (const model of models) {
    const entry = resolvePricing(deps.pricing, model.providerId, model.modelId, pricingDate);
    if (!entry) {
      unknownFor.push(model.alias);
      continue;
    }
    const runs = runsPerFixtureByAlias[model.alias]!;
    for (const fixture of fixtures) {
      const perAttempt = costForAttempt(entry, inputTokenEstimate(fixture), model.maxOutputTokens);
      if (perAttempt === null) {
        unknownFor.push(model.alias);
        break;
      }
      maxCost += perAttempt * MAX_PROVIDER_INVOCATIONS * runs;
    }
  }
  const estimatedMaxCostUsd = unknownFor.length > 0 ? null : maxCost;

  let liveKeys: Record<LiveProviderId, string> | null = null;
  if (args.live && !args.dryRun) {
    for (const model of models) assertLiveModelReady(model);
    const selectedLiveProviders = [
      ...new Set(models.map((model) => model.providerId)),
    ].filter((providerId): providerId is LiveProviderId =>
      (LIVE_PROVIDER_IDS as readonly string[]).includes(providerId),
    );
    liveKeys = requireKeysForProviders(selectedLiveProviders, deps.env as Record<string, string | undefined>);
  }

  const benchmarkRunId = args.seed
    ? `${EVALUATION_VERSION.evaluationVersion}-seed-${args.seed}`
    : `${EVALUATION_VERSION.evaluationVersion}-${compactTimestamp(now)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    mode,
    benchmarkRunId,
    outDir: args.out ?? 'packages/eval/.runs',
    models,
    fixtures,
    runsPerFixtureByAlias,
    reasoningEffortByAlias,
    plannedOrchestrations,
    providerCallUpperBound,
    estimatedMaxCostUsd,
    estimatedMaxCostUnknownFor: [...new Set(unknownFor)],
    pricingDate,
    liveKeys,
  };
}

export function renderPreRunSummary(plan: RunPlan): string {
  const lines: string[] = [];
  lines.push('RivalLens Phase 4B — Frozen-Fixture Real-Model Evaluation');
  lines.push(
    plan.mode === 'live'
      ? 'mode: LIVE (real provider network requests WILL be made)'
      : 'mode: MOCK (no --live; no provider network requests)',
  );
  lines.push(
    `evaluationVersion: ${EVALUATION_VERSION.evaluationVersion}   suiteVersion: ${EVALUATION_VERSION.suiteVersion}   promptVersion: ${EVALUATION_VERSION.systemPromptVersion}`,
  );
  lines.push(`fixtures: ${plan.fixtures.length} selected (${plan.fixtures.map((f) => f.scenarioLetter).join(', ')})`);
  lines.push(`models: ${plan.models.length} selected`);
  for (const model of plan.models) {
    const effort = plan.reasoningEffortByAlias[model.alias] ?? 'default';
    const struct = model.structuredOutputMode ?? '-';
    const timeout = model.timeoutMs === undefined ? 'default' : `${model.timeoutMs}ms`;
    lines.push(
      `  ${model.alias.padEnd(22)} ${model.providerId}:${model.modelId}   runs/fixture=${plan.runsPerFixtureByAlias[model.alias]}   effort=${effort}   struct=${struct}   timeout=${timeout}`,
    );
  }
  lines.push(`planned orchestrations: ${plan.plannedOrchestrations}`);
  lines.push(`provider-call upper bound (x${MAX_PROVIDER_INVOCATIONS} for repair): ${plan.providerCallUpperBound}`);
  if (plan.estimatedMaxCostUsd === null) {
    lines.push(
      `estimated MAX cost: unknown — no pricing for: ${plan.estimatedMaxCostUnknownFor.join(', ')}`,
    );
  } else {
    lines.push(`estimated MAX cost (pricing ${plan.pricingDate}): $${plan.estimatedMaxCostUsd.toFixed(4)}`);
  }
  lines.push(`out: ${plan.outDir}/${plan.benchmarkRunId}/`);
  return lines.join('\n');
}
