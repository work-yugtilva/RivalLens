import { describe, expect, it } from 'vitest';
import { parseEvalArgs, selectFixturesByToken } from '../../packages/eval/src/cli/args';
import { loadModelConfigFromDisk, selectModels } from '../../packages/eval/src/config/models';
import { FIXTURES } from './helpers/harness';

const MODEL_CONFIG = loadModelConfigFromDisk();

describe('CLI argument parsing', () => {
  it('has safe defaults', () => {
    const args = parseEvalArgs([]);
    expect(args).toMatchObject({
      fixtures: [],
      models: [],
      runs: null,
      live: false,
      dryRun: false,
      strictCost: false,
      failOnIneligible: false,
      reasoningEffort: null,
    });
  });

  it('parses and validates --reasoning-effort', () => {
    expect(parseEvalArgs(['--reasoning-effort', 'high']).reasoningEffort).toBe('high');
    expect(() => parseEvalArgs(['--reasoning-effort', 'ultra'])).toThrow(/--reasoning-effort/);
  });

  it('parses csv filters and flags', () => {
    const args = parseEvalArgs([
      '--fixtures',
      'A,B, all ',
      '--models',
      'mock',
      '--runs',
      '3',
      '--live',
      '--seed',
      'x1',
    ]);
    expect(args.fixtures).toEqual(['A', 'B']);
    expect(args.models).toEqual(['mock']);
    expect(args.runs).toBe(3);
    expect(args.live).toBe(true);
    expect(args.seed).toBe('x1');
  });

  it('rejects an out-of-range --runs', () => {
    expect(() => parseEvalArgs(['--runs', '0'])).toThrow(/--runs/);
    expect(() => parseEvalArgs(['--runs', '99'])).toThrow(/--runs/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseEvalArgs(['--bogus'])).toThrow();
  });
});

describe('fixture filtering', () => {
  it('selects by scenario letter or fixtureId, de-duplicated', () => {
    const picked = selectFixturesByToken(FIXTURES, ['A', 'b-shipping-threshold-diff', 'A']);
    expect(picked.map((fixture) => fixture.scenarioLetter)).toEqual(['A', 'B']);
  });

  it('returns all fixtures for an empty selection', () => {
    expect(selectFixturesByToken(FIXTURES, [])).toHaveLength(15);
  });

  it('throws on an unknown fixture token', () => {
    expect(() => selectFixturesByToken(FIXTURES, ['Z'])).toThrow(/unknown fixture/);
  });
});

describe('model filtering (trusted alias allowlist ONLY)', () => {
  it('selects by alias', () => {
    expect(selectModels(MODEL_CONFIG, ['mock']).map((model) => model.alias)).toEqual(['mock']);
    expect(selectModels(MODEL_CONFIG, []).length).toBe(MODEL_CONFIG.models.length);
  });

  it('never accepts provider:modelId or arbitrary model ids', () => {
    expect(() => selectModels(MODEL_CONFIG, ['openai:gpt-4o'])).toThrow(/aliases only/);
    expect(() => selectModels(MODEL_CONFIG, ['some/model'])).toThrow(/aliases only/);
  });

  it('throws on an unknown alias and lists the available ones', () => {
    expect(() => selectModels(MODEL_CONFIG, ['not-a-model'])).toThrow(/anthropic-sonnet/);
  });
});
