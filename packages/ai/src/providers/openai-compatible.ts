import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import {
  elapsedMs,
  mapOpenAiSdkError,
  normalizeParameters,
  parseRawJson,
  serializeRequestContext,
  validateProviderOptions,
  type ProviderAdapterOptions,
} from './common';
import {
  IntelligenceProviderError,
  type IntelligenceModelProvider,
  type IntelligenceRequest,
  type IntelligenceResponse,
  type ReasoningEffort,
} from '../provider';

/**
 * Shared adapter for API-accessible open-weight model families whose official APIs are
 * OpenAI Chat-Completions compatible (verified against first-party docs 2026-09-09):
 * DeepSeek, Kimi (Moonshot), GLM (Z.ai / Zhipu), Qwen (Alibaba DashScope).
 *
 * SECURITY INVARIANTS:
 *  - The provider key is trusted server configuration. The base URL is fixed in this
 *    source registry; it is NEVER taken from the request, the context, model output,
 *    or a CLI flag.
 *  - `IntelligenceRequest` carries no URL / endpoint / credential.
 *  - Model output is returned verbatim as `rawOutput: unknown`. There is no
 *    `parsedOutput` / `trustedOutput`; `validateIntelligenceSynthesis` remains the sole
 *    acceptance path.
 *  - SDK auto-retries are disabled (`maxRetries: 0`); the orchestrator owns retry policy
 *    and the two-invocation cap.
 *  - Unsupported reasoning-effort levels and unsupported temperature are rejected BEFORE
 *    any network call.
 */

type CompatReasoning =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'reasoning_effort';
      readonly supported: readonly ReasoningEffort[];
    };

type CompatProviderConfig = {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly structuredOutputMode: 'json_object';
  readonly temperatureSupported: boolean;
  readonly reasoning: CompatReasoning;
  /** Qwen: reasoning is a non-standard `enable_thinking` flag; we always benchmark it off. */
  readonly forceDisableThinking: boolean;
};

export const TRUSTED_COMPATIBLE_PROVIDERS = {
  deepseek: {
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    structuredOutputMode: 'json_object',
    temperatureSupported: false,
    reasoning: { kind: 'reasoning_effort', supported: ['low', 'high'] },
    forceDisableThinking: false,
  },
  kimi: {
    providerId: 'kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    structuredOutputMode: 'json_object',
    temperatureSupported: true,
    reasoning: { kind: 'none' },
    forceDisableThinking: false,
  },
  glm: {
    providerId: 'glm',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    structuredOutputMode: 'json_object',
    temperatureSupported: true,
    reasoning: { kind: 'reasoning_effort', supported: ['low', 'medium', 'high'] },
    forceDisableThinking: false,
  },
  qwen: {
    providerId: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    structuredOutputMode: 'json_object',
    temperatureSupported: true,
    reasoning: { kind: 'none' },
    forceDisableThinking: true,
  },
} as const satisfies Record<string, CompatProviderConfig>;

export type TrustedCompatibleProviderKey = keyof typeof TRUSTED_COMPATIBLE_PROVIDERS;

// Applied identically to every json_object provider. This is output-format glue, not
// per-model strategic instruction (see Phase 4B §16): the models below do not enforce a
// JSON Schema, so the schema is supplied in-band.
const OUTPUT_FORMAT_INSTRUCTION =
  '\n\nOUTPUT FORMAT: Return only a single JSON object — no prose, no markdown, no code fences — ' +
  'that conforms exactly to this JSON Schema:\n';

type CompatChatResponse = {
  readonly id?: string | null;
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null } | null;
    readonly finish_reason?: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number | null;
    readonly completion_tokens?: number | null;
    readonly total_tokens?: number | null;
  } | null;
};

export class OpenAiCompatibleIntelligenceProvider implements IntelligenceModelProvider {
  readonly providerId: string;
  readonly modelId: string;
  private readonly config: CompatProviderConfig;
  private readonly client: OpenAI;

  constructor(providerKey: string, options: ProviderAdapterOptions) {
    const registry: Readonly<Record<string, CompatProviderConfig | undefined>> =
      TRUSTED_COMPATIBLE_PROVIDERS;
    const config = registry[providerKey];
    if (!config) {
      throw new IntelligenceProviderError(
        'authentication_configuration',
        'The intelligence provider is not a trusted OpenAI-compatible provider',
      );
    }
    const validated = validateProviderOptions(options);
    this.config = config;
    this.providerId = config.providerId;
    this.modelId = validated.modelId;
    this.client = new OpenAI({
      apiKey: validated.apiKey,
      baseURL: config.baseUrl,
      timeout: validated.timeoutMs,
      maxRetries: 0,
    });
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: IntelligenceRequest<TSchema>,
  ): Promise<IntelligenceResponse> {
    const parameters = normalizeParameters(request.parameters);

    if (parameters.temperature !== undefined && !this.config.temperatureSupported) {
      throw new IntelligenceProviderError(
        'invalid_request',
        `The ${this.providerId} model does not accept a temperature parameter`,
      );
    }

    const effort = parameters.reasoningEffort;
    if (effort !== undefined) {
      const supported =
        this.config.reasoning.kind === 'reasoning_effort' ? this.config.reasoning.supported : [];
      if (!supported.includes(effort)) {
        throw new IntelligenceProviderError(
          'invalid_request',
          `The ${this.providerId} model does not support reasoning effort "${effort}"`,
        );
      }
    }

    const schemaBlock = JSON.stringify(
      zodToJsonSchema(request.responseSchema, { $refStrategy: 'none' }),
    );

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: [
        { role: 'system', content: `${request.systemPrompt}${OUTPUT_FORMAT_INSTRUCTION}${schemaBlock}` },
        { role: 'user', content: serializeRequestContext(request) },
      ],
      max_tokens: parameters.maxOutputTokens,
      response_format: { type: 'json_object' },
    };
    if (parameters.temperature !== undefined) {
      body.temperature = parameters.temperature;
    }
    if (effort !== undefined && this.config.reasoning.kind === 'reasoning_effort') {
      body.reasoning_effort = effort;
      body.thinking = { type: 'enabled' };
    }
    if (this.config.forceDisableThinking) {
      body.enable_thinking = false;
    }

    const startedAt = Date.now();
    try {
      const response = (await this.client.chat.completions.create(
        body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      )) as unknown as CompatChatResponse;
      const content = response.choices?.[0]?.message?.content ?? undefined;
      return {
        rawOutput: parseRawJson(content ?? undefined),
        telemetry: {
          providerId: this.providerId,
          modelId: this.modelId,
          latencyMs: elapsedMs(startedAt),
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
          estimatedCostUsd: null,
          rawResponseId: response.id ?? null,
          finishReason: response.choices?.[0]?.finish_reason ?? null,
        },
      };
    } catch (error) {
      const mapped = mapOpenAiSdkError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }
}
