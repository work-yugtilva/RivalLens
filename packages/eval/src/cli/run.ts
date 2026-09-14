import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadGateConfigFromDisk, type GateConfig } from '../config/gates';
import {
  loadModelConfigFromDisk,
  type ModelConfig,
  type ModelConfigEntry,
} from '../config/models';
import { loadAllFrozenFixtures } from '../fixtures/load';
import type { FrozenFixture } from '../fixtures/schema';
import { loadPricingFromDisk, type PricingTable } from '../pricing/pricing';
import {
  createLiveProvider,
  createMockProvider,
  resolveMockScenario,
} from '../providers/factory';
import { runSuite } from '../runner/runSuite';
import { renderGateSummary } from '../report/summary';
import { writeBenchmarkOutputs } from '../report/write';
import { parseEvalArgs } from './args';
import { planRun, renderPreRunSummary } from './plan';

export type ExecuteEvalOverrides = {
  readonly modelConfig?: ModelConfig;
  readonly pricing?: PricingTable;
  readonly gateConfig?: GateConfig;
  readonly fixtures?: readonly FrozenFixture[];
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: (text: string) => void;
  readonly now?: Date;
};

function currentGitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export async function executeEval(
  argv: readonly string[],
  overrides: ExecuteEvalOverrides = {},
): Promise<number> {
  const out = overrides.stdout ?? ((text: string) => process.stdout.write(text));
  const args = parseEvalArgs(argv);

  const modelConfig = overrides.modelConfig ?? loadModelConfigFromDisk();
  const pricing = overrides.pricing ?? loadPricingFromDisk();
  const gateConfig = overrides.gateConfig ?? loadGateConfigFromDisk();
  const fixtures = overrides.fixtures ?? loadAllFrozenFixtures();

  const plan = planRun(args, {
    modelConfig,
    pricing,
    fixtures,
    env: overrides.env ?? process.env,
    now: overrides.now,
  });

  out(`${renderPreRunSummary(plan)}\n`);

  // PAID RUN SAFETY: no provider network request happens without --live, and --dry-run
  // never touches the network or the filesystem.
  if (args.dryRun) {
    out('\n--dry-run: no providers constructed, no runs executed, no files written.\n');
    return 0;
  }

  if (args.captureRaw) {
    out(
      'WARNING: Raw model outputs will be written locally and may contain source/context data.\n',
    );
  }

  const makeProvider =
    plan.mode === 'live'
      ? (model: ModelConfigEntry): ReturnType<typeof createLiveProvider> =>
          createLiveProvider(model, plan.liveKeys![model.providerId as keyof typeof plan.liveKeys]!)
      : (_model: ModelConfigEntry, fixture: FrozenFixture) =>
          createMockProvider(resolveMockScenario(args.mockScenario ?? fixture.mockScenario));

  const outDir = join(plan.outDir, plan.benchmarkRunId);
  const result = await runSuite({
    benchmarkRunId: plan.benchmarkRunId,
    mode: plan.mode,
    fixtures: plan.fixtures,
    models: plan.models,
    runsPerFixtureOverride: args.runs ?? undefined,
    reasoningEffortByAlias: plan.reasoningEffortByAlias,
    mockScenarioOverride: args.mockScenario ?? undefined,
    makeProvider: (model, fixture) => makeProvider(model, fixture),
    pricing,
    pricingDate: plan.pricingDate,
    gateConfig,
    gitCommit: currentGitCommit(),
    now: overrides.now ? () => overrides.now!.toISOString() : undefined,
    captureRaw: args.captureRaw,
    ...(args.captureRaw ? { rawDir: join(outDir, 'raw') } : {}),
  });

  const written = writeBenchmarkOutputs(outDir, result, {
    emitRubricTemplate: args.emitRubricTemplate,
  });

  out(`${renderGateSummary(result)}\n`);
  out(`\nWrote ${written.length} artifacts to ${outDir}/\n`);

  const anyIneligible = result.modelReports.some((report) => !report.eligibility.eligible);
  return args.failOnIneligible && anyIneligible ? 2 : 0;
}
