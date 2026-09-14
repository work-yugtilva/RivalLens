import { describe, expect, it } from 'vitest';
import { REASONING_EFFORT_LEVELS } from '../../packages/ai/src';
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_PROVIDER_TIMEOUT_MS,
} from '../../packages/ai/src/providers/common';
import {
  LIVE_PROVIDER_IDS,
  loadModelConfig,
  loadModelConfigFromDisk,
} from '../../packages/eval/src/config/models';
import { PROVIDER_ENV_KEYS } from '../../packages/eval/src/config/env';
import { createLiveProvider } from '../../packages/eval/src/providers/factory';
import { loadPricingFromDisk, resolvePricing } from '../../packages/eval/src/pricing/pricing';

const CONFIG = loadModelConfigFromDisk();
const PRICING = loadPricingFromDisk();
const PRICING_DATE = '2026-09-09';

describe('Phase 4B candidate model catalog', () => {
  it('is the mock plus the seven verified candidate families', () => {
    expect(CONFIG.models.map((model) => model.alias)).toEqual([
      'mock',
      'openai-terra',
      'anthropic-sonnet',
      'gemini-flash',
      'deepseek-flagship',
      'kimi-flagship',
      'glm-flagship',
      'qwen-flagship',
    ]);
  });

  it('carries no placeholder modelId and a structuredOutputMode for every candidate', () => {
    for (const model of CONFIG.models) {
      if (model.providerId === 'deterministic-mock') continue;
      expect(model.modelId).not.toMatch(/REPLACE_WITH/i);
      expect(model.structuredOutputMode).toBeDefined();
    }
  });

  it('reports the actual structured-output transport for the first-party families', () => {
    const modeByAlias = Object.fromEntries(CONFIG.models.map((model) => [model.alias, model.structuredOutputMode]));
    expect(modeByAlias['openai-terra']).toBe('strict_json_schema');
    expect(modeByAlias['anthropic-sonnet']).toBe('json_object');
    expect(modeByAlias['gemini-flash']).toBe('json_object');
  });

  it('sets a 120s client timeout only for anthropic-sonnet and passes per-model timeouts to the adapter', () => {
    const byAlias = new Map(CONFIG.models.map((model) => [model.alias, model]));
    for (const model of CONFIG.models) {
      expect(model.timeoutMs).toBe(model.alias === 'anthropic-sonnet' ? 120_000 : undefined);
    }
    const clientTimeout = (alias: string) =>
      ((createLiveProvider(byAlias.get(alias)!, 'test-key-not-real') as unknown as { client: { timeout: number } })
        .client.timeout);
    expect(clientTimeout('anthropic-sonnet')).toBe(120_000);
    expect(clientTimeout('openai-terra')).toBe(DEFAULT_PROVIDER_TIMEOUT_MS);
  });

  it('rejects a per-model timeout that is not a positive integer within the adapter ceiling', () => {
    const entry = CONFIG.models.find((model) => model.alias === 'anthropic-sonnet')!;
    for (const timeoutMs of [0, 1.5, MAX_PROVIDER_TIMEOUT_MS + 1]) {
      expect(() => loadModelConfig({ configVersion: 'test', models: [{ ...entry, timeoutMs }] })).toThrow();
    }
    expect(loadModelConfig({ configVersion: 'test', models: [{ ...entry, timeoutMs: MAX_PROVIDER_TIMEOUT_MS }] }).models[0]?.timeoutMs)
      .toBe(MAX_PROVIDER_TIMEOUT_MS);
  });

  it('only declares supported reasoning-effort levels from the common set', () => {
    for (const model of CONFIG.models) {
      for (const level of model.supportedReasoningEfforts) {
        expect(REASONING_EFFORT_LEVELS).toContain(level);
      }
    }
  });

  it('has an env var mapping for every live provider id used by a candidate', () => {
    for (const model of CONFIG.models) {
      if (model.providerId === 'deterministic-mock') continue;
      expect(LIVE_PROVIDER_IDS).toContain(model.providerId);
      expect(PROVIDER_ENV_KEYS[model.providerId as keyof typeof PROVIDER_ENV_KEYS]).toBeTruthy();
    }
  });

  it('has a pricing row for every candidate except glm-flagship (price unpublished => null)', () => {
    for (const model of CONFIG.models) {
      const entry = resolvePricing(PRICING, model.providerId, model.modelId, PRICING_DATE);
      if (model.alias === 'glm-flagship') {
        expect(entry).toBeNull();
      } else {
        expect(entry).not.toBeNull();
      }
    }
  });

  it('builds a provider for every live candidate without any network call', () => {
    for (const model of CONFIG.models) {
      if (model.providerId === 'deterministic-mock') continue;
      const provider = createLiveProvider(model, 'test-key-not-real');
      expect(provider.providerId).toBe(model.providerId);
      expect(provider.modelId).toBe(model.modelId);
      expect((provider as unknown as Record<string, unknown>).apiKey).toBeUndefined();
    }
  });
});
