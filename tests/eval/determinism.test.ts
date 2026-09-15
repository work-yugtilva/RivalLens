import { describe, expect, it } from 'vitest';
import type { BenchmarkRunRecord } from '../../packages/eval/src/runner/runSuite';
import { runMockSuite } from './helpers/harness';

// Strip wall-clock / latency jitter; everything else must be identical across identical runs.
function stableCore(run: BenchmarkRunRecord) {
  const metrics = structuredClone(run.perRunMetrics) as Record<string, unknown>;
  delete metrics.timings;
  return {
    runId: run.runId,
    fixtureId: run.fixtureId,
    status: run.status,
    fallbackReason: run.fallbackReason,
    terminalValidatorStatus: run.terminalValidatorStatus,
    trustBoundary: run.trustBoundary,
    metrics,
    attemptShapes: run.attempts.map((attempt) => ({
      kind: attempt.kind,
      retryReason: attempt.retryReason ?? null,
      validationStatus: attempt.validation?.status ?? null,
      errorCodes: attempt.validation?.errorCodes ?? [],
      providerFailure: attempt.providerFailure ?? null,
    })),
  };
}

describe('repeated-run determinism', () => {
  it('produces an identical stable core and identical aggregates across two runs of the same suite', async () => {
    const ids = [
      'b-shipping-threshold-diff',
      'g-coherent-multi-signal',
      'j-many-unknown-fields',
      'k-estimated-and-observed',
      'o-adversarial-injection-text',
    ];
    const first = await runMockSuite(ids, { benchmarkRunId: 'det-1' });
    const second = await runMockSuite(ids, { benchmarkRunId: 'det-1' });

    expect(first.runs.map(stableCore)).toEqual(second.runs.map(stableCore));

    const strip = (reports: typeof first.modelReports) =>
      reports.map((report) => ({
        alias: report.aggregate.modelAlias,
        eligible: report.eligibility.eligible,
        gates: report.eligibility.gates.map((gate) => ({ id: gate.id, passed: gate.passed })),
        groundingPassRate: report.aggregate.groundingPassRate,
        fallbackRate: report.aggregate.fallbackRate,
        injectionDefenseFailureRate: report.aggregate.injectionDefenseFailureRate,
        unknownAsAbsence: report.aggregate.totalUnknownAsAbsenceCount,
      }));
    expect(strip(first.modelReports)).toEqual(strip(second.modelReports));
  });

  it('repeats runsPerFixture times per (model, fixture)', async () => {
    const suite = await runMockSuite(['b-shipping-threshold-diff'], { benchmarkRunId: 'det-2' });
    // the mock model config is runsPerFixture=1
    expect(suite.runs.filter((run) => run.fixtureId === 'b-shipping-threshold-diff')).toHaveLength(1);
  });
});
