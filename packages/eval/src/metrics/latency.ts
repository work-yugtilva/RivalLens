// Latency aggregation primitives. Nearest-rank percentiles (no interpolation) so results
// are stable and reproducible regardless of sample size.

export function percentileNearestRank(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (!Number.isFinite(p) || p <= 0 || p > 100) {
    throw new RangeError(`percentile p must be in (0, 100], received ${p}`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index]!;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type LatencySummary = {
  readonly n: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly mean: number | null;
};

export function summarizeLatencySeries(values: readonly number[]): LatencySummary {
  return {
    n: values.length,
    p50: percentileNearestRank(values, 50),
    p95: percentileNearestRank(values, 95),
    mean: mean(values),
  };
}
