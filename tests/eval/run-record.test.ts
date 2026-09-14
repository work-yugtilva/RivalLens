import { describe, expect, it } from 'vitest';
import {
  serializeManifest,
  serializeModelAggregates,
  serializeRunsJsonl,
} from '../../packages/eval/src/report/runRecord';
import { runMockSuite } from './helpers/harness';

describe('benchmark run records', () => {
  it('serializes runs.jsonl deterministically with no raw output or prompt text', async () => {
    const result = await runMockSuite(['b-shipping-threshold-diff', 'o-adversarial-injection-text']);
    const jsonl = serializeRunsJsonl(result.runs);

    // one line per run, trailing newline
    expect(jsonl.trimEnd().split('\n')).toHaveLength(result.runs.length);
    expect(jsonl.endsWith('\n')).toBe(true);

    // stable key order: re-serialising is byte-identical
    expect(serializeRunsJsonl(result.runs)).toBe(jsonl);

    // never leak model text / prompts / competitor content
    for (const forbidden of [
      'rawOutput',
      'systemPrompt',
      'promptVersion',
      'IGNORE ALL PRIOR INSTRUCTIONS',
      'strategicPostureSummary',
      'statement',
    ]) {
      expect(jsonl).not.toContain(forbidden);
    }

    for (const line of jsonl.trimEnd().split('\n')) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(record).not.toHaveProperty('rawOutput');
      expect(record).toHaveProperty('perRunMetrics');
      expect(record).toHaveProperty('trustBoundary');
      expect(record.subjectiveScores).toBeNull();
    }
  });

  it('builds a manifest with the full version bundle and no credentials', async () => {
    const result = await runMockSuite(['b-shipping-threshold-diff']);
    const manifest = JSON.parse(serializeManifest(result)) as Record<string, unknown>;
    expect(manifest.mode).toBe('mock');
    expect((manifest.evaluationVersion as Record<string, unknown>).systemPromptVersion).toBe(
      'intelligence-synthesis-v1',
    );
    expect(manifest.gitCommit).toBe('testcommit');
    expect(JSON.stringify(manifest)).not.toMatch(/API_KEY|apiKey|sk-/);
  });

  it('emits model aggregates with per-model eligibility', async () => {
    const result = await runMockSuite(['b-shipping-threshold-diff', 'j-many-unknown-fields']);
    const aggregates = JSON.parse(serializeModelAggregates(result)) as {
      models: Array<{ eligibility: { eligible: boolean; gates: unknown[] } }>;
      byProvider: unknown[];
    };
    expect(aggregates.models).toHaveLength(1);
    expect(aggregates.models[0]!.eligibility.gates.length).toBeGreaterThan(0);
    expect(aggregates.byProvider).toHaveLength(1);
  });
});
