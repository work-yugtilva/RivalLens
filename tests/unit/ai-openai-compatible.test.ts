import { describe, expect, it } from 'vitest';
import {
  OpenAiCompatibleIntelligenceProvider,
  TRUSTED_COMPATIBLE_PROVIDERS,
} from '../../packages/ai/src/providers/openai-compatible';

/**
 * Trust-boundary guards for the shared OpenAI-compatible adapter. The registry is the ONLY
 * source of a base URL; nothing in the request, context, model output, or CLI can influence it.
 */
describe('TRUSTED_COMPATIBLE_PROVIDERS registry', () => {
  it('exposes exactly the four vetted open-weight families', () => {
    expect(Object.keys(TRUSTED_COMPATIBLE_PROVIDERS).sort()).toEqual(['deepseek', 'glm', 'kimi', 'qwen']);
  });

  it('pins every base URL to a hardcoded https literal', () => {
    for (const [key, entry] of Object.entries(TRUSTED_COMPATIBLE_PROVIDERS)) {
      expect(entry.providerId).toBe(key);
      expect(entry.baseUrl).toMatch(/^https:\/\//);
      expect(entry.structuredOutputMode).toBe('json_object');
    }
    expect(TRUSTED_COMPATIBLE_PROVIDERS.deepseek.baseUrl).toBe('https://api.deepseek.com');
    expect(TRUSTED_COMPATIBLE_PROVIDERS.kimi.baseUrl).toBe('https://api.moonshot.ai/v1');
    expect(TRUSTED_COMPATIBLE_PROVIDERS.glm.baseUrl).toBe('https://api.z.ai/api/paas/v4');
    expect(TRUSTED_COMPATIBLE_PROVIDERS.qwen.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('rejects an unknown provider key', () => {
    expect(
      () =>
        new OpenAiCompatibleIntelligenceProvider('https://evil.example', {
          apiKey: 'k',
          modelId: 'm',
        }),
    ).toThrow(/trusted OpenAI-compatible provider/);
  });

  it('exposes a stable providerId/modelId and never leaks the api key', () => {
    const provider = new OpenAiCompatibleIntelligenceProvider('deepseek', {
      apiKey: 'sk-secret-value',
      modelId: 'deepseek-v4-pro',
    });
    expect(provider.providerId).toBe('deepseek');
    expect(provider.modelId).toBe('deepseek-v4-pro');
    expect((provider as unknown as Record<string, unknown>).apiKey).toBeUndefined();
    expect(Object.keys(provider)).not.toContain('apiKey');
  });
});
