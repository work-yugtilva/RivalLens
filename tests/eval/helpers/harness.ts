import {
  DETERMINISTIC_MOCK_SEQUENCES,
  DeterministicMockIntelligenceProvider,
  type DeterministicMockScenario,
  type DeterministicMockSequence,
} from '../../../packages/ai/src';
import { loadGateConfigFromDisk } from '../../../packages/eval/src/config/gates';
import { loadModelConfigFromDisk } from '../../../packages/eval/src/config/models';
import { loadAllFrozenFixtures } from '../../../packages/eval/src/fixtures/load';
import { loadPricingFromDisk } from '../../../packages/eval/src/pricing/pricing';
import { createMockProvider, resolveMockScenario } from '../../../packages/eval/src/providers/factory';
import { runFixtureModel } from '../../../packages/eval/src/runner/runFixtureModel';
import { runSuite, type BenchmarkResult } from '../../../packages/eval/src/runner/runSuite';
import type { FrozenFixture } from '../../../packages/eval/src/fixtures/schema';

export const FIXTURES: FrozenFixture[] = loadAllFrozenFixtures();

export function fixtureById(id: string): FrozenFixture {
  const found = FIXTURES.find((fixture) => fixture.fixtureId === id);
  if (!found) throw new Error(`no fixture with id "${id}"`);
  return found;
}

export function resolveScenario(
  name: string,
): DeterministicMockScenario | DeterministicMockSequence {
  if (name in DETERMINISTIC_MOCK_SEQUENCES) {
    return DETERMINISTIC_MOCK_SEQUENCES[name as keyof typeof DETERMINISTIC_MOCK_SEQUENCES];
  }
  return name as DeterministicMockScenario;
}

export async function runMock(
  fixture: FrozenFixture,
  scenario: DeterministicMockScenario | DeterministicMockSequence,
) {
  const provider = new DeterministicMockIntelligenceProvider(scenario);
  const run = await runFixtureModel({ fixture, provider });
  return { provider, result: run.result, attempts: run.attempts, timings: run.timings };
}

export async function runMockSuite(
  fixtureIds: readonly string[],
  options: { readonly now?: Date; readonly benchmarkRunId?: string } = {},
): Promise<BenchmarkResult> {
  const modelConfig = loadModelConfigFromDisk();
  const mockModel = modelConfig.models.find((model) => model.providerId === 'deterministic-mock')!;
  const fixtures = fixtureIds.map((id) => fixtureById(id));
  const now = options.now ?? new Date('2026-09-09T00:00:00.000Z');
  return runSuite({
    benchmarkRunId: options.benchmarkRunId ?? 'test-bench',
    mode: 'mock',
    fixtures,
    models: [mockModel],
    makeProvider: (_model, fixture) => createMockProvider(resolveMockScenario(fixture.mockScenario)),
    pricing: loadPricingFromDisk(),
    pricingDate: '2026-09-09',
    gateConfig: loadGateConfigFromDisk(),
    gitCommit: 'testcommit',
    now: () => now.toISOString(),
  });
}
