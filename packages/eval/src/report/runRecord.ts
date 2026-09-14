import { stableJsonl, stableStringify } from '../util/stableJson';
import type { BenchmarkResult, BenchmarkRunRecord } from '../runner/runSuite';

// Machine-readable artifacts. No raw model output, no prompt/system text, no snippet or
// competitor text ever reaches these files — BenchmarkRunRecord already carries only
// SafeAttemptSummary telemetry and numeric metrics.
export function serializeRunsJsonl(runs: readonly BenchmarkRunRecord[]): string {
  return stableJsonl(runs);
}

export function serializeManifest(result: BenchmarkResult): string {
  return stableStringify(result.manifest);
}

export function serializeModelAggregates(result: BenchmarkResult): string {
  return stableStringify({
    benchmarkRunId: result.manifest.benchmarkRunId,
    evaluationVersion: result.manifest.evaluationVersion,
    models: result.modelReports,
    byProvider: result.providerAggregates,
  });
}
