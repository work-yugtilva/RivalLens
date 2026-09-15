import { parseArgs } from 'node:util';
import { REASONING_EFFORT_LEVELS, type ReasoningEffort } from '@rivallens/ai';

export type EvalArgs = {
  readonly fixtures: string[];
  readonly models: string[];
  readonly runs: number | null;
  readonly out: string | null;
  readonly live: boolean;
  readonly dryRun: boolean;
  readonly mockScenario: string | null;
  readonly emitRubricTemplate: boolean;
  readonly seed: string | null;
  readonly strictCost: boolean;
  readonly failOnIneligible: boolean;
  // Uniform reasoning-effort override for every selected model. Rejected before any
  // provider is constructed if a selected model does not support it.
  readonly reasoningEffort: ReasoningEffort | null;
  // Opt-in, eval/debug-only: persist raw candidate output + full validation detail per
  // attempt under `<outDir>/<runId>/raw/`. Default false; never enabled implicitly.
  readonly captureRaw: boolean;
};

function csv(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
    : [];
}

export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: false,
    strict: true,
    options: {
      fixtures: { type: 'string' },
      models: { type: 'string' },
      runs: { type: 'string' },
      out: { type: 'string' },
      live: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'mock-scenario': { type: 'string' },
      'emit-rubric-template': { type: 'boolean', default: false },
      seed: { type: 'string' },
      'strict-cost': { type: 'boolean', default: false },
      'fail-on-ineligible': { type: 'boolean', default: false },
      'reasoning-effort': { type: 'string' },
      'capture-raw': { type: 'boolean', default: false },
    },
  });

  let runs: number | null = null;
  if (values.runs !== undefined) {
    runs = Number(values.runs);
    if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
      throw new Error('--runs must be an integer between 1 and 20');
    }
  }

  let reasoningEffort: ReasoningEffort | null = null;
  if (values['reasoning-effort'] !== undefined) {
    const value = values['reasoning-effort'];
    if (!(REASONING_EFFORT_LEVELS as readonly string[]).includes(value)) {
      throw new Error(
        `--reasoning-effort must be one of ${REASONING_EFFORT_LEVELS.join(', ')} (got "${value}")`,
      );
    }
    reasoningEffort = value as ReasoningEffort;
  }

  return {
    fixtures: csv(values.fixtures).filter((token) => token.toLowerCase() !== 'all'),
    models: csv(values.models),
    runs,
    out: values.out ?? null,
    live: values.live ?? false,
    dryRun: values['dry-run'] ?? false,
    mockScenario: values['mock-scenario'] ?? null,
    emitRubricTemplate: values['emit-rubric-template'] ?? false,
    seed: values.seed ?? null,
    strictCost: values['strict-cost'] ?? false,
    failOnIneligible: values['fail-on-ineligible'] ?? false,
    reasoningEffort,
    captureRaw: values['capture-raw'] ?? false,
  };
}

export function selectFixturesByToken<T extends { fixtureId: string; scenarioLetter: string }>(
  all: readonly T[],
  tokens: readonly string[],
): T[] {
  if (tokens.length === 0) return [...all];
  const byId = new Map(all.map((fixture) => [fixture.fixtureId, fixture]));
  const byLetter = new Map(all.map((fixture) => [fixture.scenarioLetter.toUpperCase(), fixture]));
  const selected: T[] = [];
  for (const token of tokens) {
    const match = byId.get(token) ?? byLetter.get(token.toUpperCase());
    if (!match) {
      throw new Error(
        `unknown fixture "${token}". Use a scenario letter (A-O) or a fixtureId. Available: ${[...byId.keys()].join(', ')}`,
      );
    }
    if (!selected.includes(match)) selected.push(match);
  }
  return selected;
}
