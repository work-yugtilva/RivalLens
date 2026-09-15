import {
  DETERMINISTIC_MOCK_SEQUENCES,
  DeterministicMockIntelligenceProvider,
  type DeterministicMockScenario,
  type DeterministicMockSequence,
  type IntelligenceModelProvider,
} from '@rivallens/ai';
// Individual adapter modules — NOT the `@rivallens/ai/providers` barrel, which carries a
// `server-only` marker for the Next.js client boundary. A Node benchmark harness is
// server-side by definition; provider request logic is reused verbatim, not duplicated.
import { AnthropicIntelligenceProvider } from '@rivallens/ai/providers/anthropic';
import { OpenAiIntelligenceProvider } from '@rivallens/ai/providers/openai';
import { GeminiIntelligenceProvider } from '@rivallens/ai/providers/gemini';
import { OpenAiCompatibleIntelligenceProvider } from '@rivallens/ai/providers/openai-compatible';
import { DEFAULT_PROVIDER_TIMEOUT_MS } from '@rivallens/ai/providers/common';
import type { ModelConfigEntry } from '../config/models';

export function createLiveProvider(
  entry: ModelConfigEntry,
  apiKey: string,
): IntelligenceModelProvider {
  const options = {
    apiKey,
    modelId: entry.modelId,
    timeoutMs: entry.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
  };
  switch (entry.providerId) {
    case 'anthropic':
      return new AnthropicIntelligenceProvider(options);
    case 'openai':
      return new OpenAiIntelligenceProvider(options);
    case 'gemini':
      return new GeminiIntelligenceProvider(options);
    // DeepSeek / Kimi / GLM / Qwen: OpenAI Chat-Completions compatible. One trusted adapter,
    // one server-owned endpoint registry keyed by providerId. No arbitrary base URL.
    case 'deepseek':
    case 'kimi':
    case 'glm':
    case 'qwen':
      return new OpenAiCompatibleIntelligenceProvider(entry.providerId, options);
    default:
      throw new Error(`live runs are not supported for providerId "${entry.providerId}"`);
  }
}

export function resolveMockScenario(
  name: string,
): DeterministicMockScenario | DeterministicMockSequence {
  if (name in DETERMINISTIC_MOCK_SEQUENCES) {
    return DETERMINISTIC_MOCK_SEQUENCES[name as keyof typeof DETERMINISTIC_MOCK_SEQUENCES];
  }
  return name as DeterministicMockScenario;
}

export function createMockProvider(
  scenario: DeterministicMockScenario | DeterministicMockSequence,
): DeterministicMockIntelligenceProvider {
  return new DeterministicMockIntelligenceProvider(scenario);
}
