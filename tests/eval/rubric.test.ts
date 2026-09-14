import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QUALITY_DIMENSION_IDS,
  QUALITY_RUBRIC_V1,
  QUALITY_RUBRIC_VERSION,
} from '../../packages/eval/src/rubric/rubric';
import { buildHumanScoringTemplate } from '../../packages/eval/src/rubric/template';
import {
  NO_DEFAULT_JUDGE,
  assertJudgeIsNotCandidate,
} from '../../packages/eval/src/rubric/judge';

describe('strategic-quality rubric', () => {
  it('is versioned with five 1-5 dimensions', () => {
    expect(QUALITY_RUBRIC_VERSION).toBe('phase-4a-rubric-v1');
    expect(QUALITY_RUBRIC_V1.scale).toEqual({ min: 1, max: 5 });
    expect(QUALITY_DIMENSION_IDS).toEqual([
      'strategicSynthesisDepth',
      'specificity',
      'experimentActionability',
      'novelty',
      'epistemicWordingQuality',
    ]);
    for (const dimension of QUALITY_RUBRIC_V1.dimensions) {
      expect(Object.keys(dimension.anchors).sort()).toEqual(['1', '2', '3', '4', '5']);
    }
  });

  it('builds a human scoring template keyed by benchmarkRunId, excluding fallback runs', () => {
    const template = buildHumanScoringTemplate('bench-1', [
      { runId: 'r1', providerId: 'openai', modelId: 'm', modelAlias: 'openai-candidate', fixtureId: 'b-shipping-threshold-diff', status: 'llm_success' },
      { runId: 'r2', providerId: 'openai', modelId: 'm', modelAlias: 'openai-candidate', fixtureId: 'i-sparse-evidence', status: 'deterministic_fallback' },
      { runId: 'r3', providerId: 'openai', modelId: 'm', modelAlias: 'openai-candidate', fixtureId: 'h-conflicting-signals', status: 'llm_partial' },
    ]);
    expect(template.benchmarkRunId).toBe('bench-1');
    expect(template.rows.map((row) => row.runId)).toEqual(['r1', 'r3']);
    for (const row of template.rows) {
      expect(Object.values(row.scores).every((score) => score === null)).toBe(true);
      expect(row.rubricVersion).toBe(QUALITY_RUBRIC_VERSION);
    }
  });

  it('exposes a judge INTERFACE only — no default judge, no concrete judge class, circular guard', () => {
    expect(NO_DEFAULT_JUDGE).toBeNull();
    expect(() => assertJudgeIsNotCandidate('m1', ['m1', 'm2'])).toThrow(/circular/i);
    expect(() => assertJudgeIsNotCandidate('independent', ['m1', 'm2'])).not.toThrow();
  });

  it('keeps judge output out of the deterministic metrics and gates modules', () => {
    const root = join(__dirname, '../../packages/eval/src');
    const scanned = [
      'metrics/mapping.ts',
      'metrics/perRun.ts',
      'metrics/aggregate.ts',
      'gates/eligibility.ts',
      'gates/trustBoundary.ts',
    ]
      .map((relative) => join(root, relative))
      .filter((path) => existsSync(path));
    expect(scanned.length).toBeGreaterThan(0);
    for (const path of scanned) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/rubric\/judge/);
      expect(source).not.toMatch(/QualityJudge/);
    }
  });
});
