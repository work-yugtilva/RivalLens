import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeEval } from '../../packages/eval/src/cli/run';
import { loadGateConfigFromDisk } from '../../packages/eval/src/config/gates';
import { loadModelConfig } from '../../packages/eval/src/config/models';
import { loadPricingFromDisk } from '../../packages/eval/src/pricing/pricing';
import { FIXTURES } from './helpers/harness';

const BASE = {
  gateConfig: loadGateConfigFromDisk(),
  pricing: loadPricingFromDisk(),
  fixtures: FIXTURES,
  now: new Date('2026-09-09T00:00:00.000Z'),
};

function capture() {
  let text = '';
  return { write: (chunk: string) => (text += chunk), get text() { return text; } };
}

const LIVE_READY_CONFIG = loadModelConfig({
  configVersion: 'test',
  models: [
    { alias: 'mock', providerId: 'deterministic-mock', modelId: 'phase-3a', temperature: 0, maxOutputTokens: 2048, runsPerFixture: 1 },
    { alias: 'anthropic-sonnet', providerId: 'anthropic', modelId: 'claude-x-test', temperature: 0, maxOutputTokens: 2048, runsPerFixture: 1, supportedReasoningEfforts: ['low', 'medium', 'high'] },
    { alias: 'deepseek-flagship', providerId: 'deepseek', modelId: 'deepseek-x-test', maxOutputTokens: 2048, runsPerFixture: 1, temperatureSupported: false, supportedReasoningEfforts: ['low', 'high'] },
    { alias: 'glm-flagship', providerId: 'glm', modelId: 'glm-x-test', temperature: 0, maxOutputTokens: 2048, runsPerFixture: 1, supportedReasoningEfforts: ['low', 'medium', 'high'] },
    { alias: 'placeholder-model', providerId: 'anthropic', modelId: 'REPLACE_WITH_OFFICIAL_ID', temperature: 0, maxOutputTokens: 2048, runsPerFixture: 1 },
  ],
});

describe('live-run guard + credentials', () => {
  it('without --live no provider network request is possible (mock completes; fetch is stubbed to throw)', async () => {
    const out = capture();
    const outDir = mkdtempSync(join(tmpdir(), 'eval-mock-'));
    const code = await executeEval(['--out', outDir, '--fixtures', 'B'], {
      ...BASE,
      env: {},
      stdout: out.write,
    });
    expect(code).toBe(0);
    expect(out.text).toMatch(/mode: MOCK/);
    const runDir = join(outDir, readdirSync(outDir)[0]!);
    expect(existsSync(join(runDir, 'runs.jsonl'))).toBe(true);
    expect(existsSync(join(runDir, 'SUMMARY.md'))).toBe(true);
  });

  it('--dry-run wins over --live: no credential check, no providers, no files', async () => {
    const out = capture();
    const outDir = mkdtempSync(join(tmpdir(), 'eval-dry-'));
    const code = await executeEval(['--live', '--dry-run', '--models', 'anthropic-sonnet', '--out', outDir], {
      ...BASE,
      modelConfig: LIVE_READY_CONFIG,
      env: {},
      stdout: out.write,
    });
    expect(code).toBe(0);
    expect(out.text).toMatch(/mode: LIVE/);
    expect(out.text).toMatch(/--dry-run: no providers constructed/);
    expect(readdirSync(outDir)).toHaveLength(0);
  });

  it('--live with a missing key exits with an error naming the variable for the SELECTED provider only', async () => {
    await expect(
      executeEval(['--live', '--models', 'anthropic-sonnet'], {
        ...BASE,
        modelConfig: LIVE_READY_CONFIG,
        env: { OPENAI_API_KEY: 'present-but-not-selected' },
        stdout: () => {},
      }),
    ).rejects.toThrow(/Missing credentials for live run: ANTHROPIC_API_KEY \(provider "anthropic"\)/);
  });

  it('--live names a new open-weight provider\'s key when it is missing', async () => {
    await expect(
      executeEval(['--live', '--models', 'glm-flagship'], {
        ...BASE,
        modelConfig: LIVE_READY_CONFIG,
        env: {},
        stdout: () => {},
      }),
    ).rejects.toThrow(/Missing credentials for live run: ZAI_API_KEY \(provider "glm"\)/);
  });

  it('rejects an unsupported --reasoning-effort BEFORE constructing any provider or checking keys', async () => {
    await expect(
      executeEval(['--live', '--models', 'deepseek-flagship', '--reasoning-effort', 'medium'], {
        ...BASE,
        modelConfig: LIVE_READY_CONFIG,
        env: { DEEPSEEK_API_KEY: 'sk-test' },
        stdout: () => {},
      }),
    ).rejects.toThrow(/does not support reasoning effort "medium"/);
  });

  it('--live rejects a model whose modelId is still a placeholder', async () => {
    await expect(
      executeEval(['--live', '--models', 'placeholder-model'], {
        ...BASE,
        modelConfig: LIVE_READY_CONFIG,
        env: { ANTHROPIC_API_KEY: 'sk-test' },
        stdout: () => {},
      }),
    ).rejects.toThrow(/placeholder modelId/);
  });

  it('--dry-run over all seven candidate families prints the provider-call ceiling and writes nothing', async () => {
    const out = capture();
    const outDir = mkdtempSync(join(tmpdir(), 'eval-dry7-'));
    const code = await executeEval(
      [
        '--live',
        '--dry-run',
        '--fixtures',
        'B',
        '--runs',
        '1',
        '--models',
        'openai-terra,anthropic-sonnet,gemini-flash,deepseek-flagship,kimi-flagship,glm-flagship,qwen-flagship',
        '--out',
        outDir,
      ],
      { ...BASE, env: {}, stdout: out.write },
    );
    expect(code).toBe(0);
    expect(out.text).toMatch(/mode: LIVE/);
    expect(out.text).toMatch(/provider-call upper bound \(x2 for repair\): 14/);
    expect(out.text).toMatch(/no pricing for: glm-flagship/);
    expect(readdirSync(outDir)).toHaveLength(0);
  });
});
