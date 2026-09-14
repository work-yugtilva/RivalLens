import { describe, expect, it } from 'vitest';
import {
  mean,
  percentileNearestRank,
  summarizeLatencySeries,
} from '../../packages/eval/src/metrics/latency';

describe('latency aggregation', () => {
  it('computes nearest-rank percentiles without interpolation', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileNearestRank(values, 50)).toBe(5);
    expect(percentileNearestRank(values, 95)).toBe(10);
    expect(percentileNearestRank(values, 100)).toBe(10);
  });

  it('is order-independent', () => {
    const shuffled = [7, 2, 9, 4, 1, 10, 3, 8, 5, 6];
    expect(percentileNearestRank(shuffled, 50)).toBe(5);
    expect(percentileNearestRank(shuffled, 95)).toBe(10);
  });

  it('handles tiny and empty samples', () => {
    expect(percentileNearestRank([42], 50)).toBe(42);
    expect(percentileNearestRank([42], 95)).toBe(42);
    expect(percentileNearestRank([10, 20], 50)).toBe(10);
    expect(percentileNearestRank([], 50)).toBeNull();
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });

  it('rejects out-of-range percentiles', () => {
    expect(() => percentileNearestRank([1], 0)).toThrow();
    expect(() => percentileNearestRank([1], 101)).toThrow();
  });

  it('summarizes a series', () => {
    expect(summarizeLatencySeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({
      n: 10,
      p50: 5,
      p95: 10,
      mean: 5.5,
    });
    expect(summarizeLatencySeries([])).toEqual({ n: 0, p50: null, p95: null, mean: null });
  });
});
