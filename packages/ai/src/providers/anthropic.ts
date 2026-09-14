import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { buildAnthropicOutputFormatInstruction } from './anthropic-format-instruction';
import {
  elapsedMs,
  normalizeParameters,
  normalizedProviderError,
  parseRawJson,
  serializeRequestContext,
  validateProviderOptions,
  type ProviderAdapterOptions,
} from './common';
import {
  IntelligenceProviderError,
  IntelligenceModelProvider,
  IntelligenceRequest,
  IntelligenceResponse,
} from '../provider';

/**
 * Anthropic transport: one-call prompt-guided JSON (benchmark `structuredOutputMode: json_object`).
 *
 * Native strict structured output (`output_config.format` json_schema) is NOT used. For the
 * RivalLens synthesis contract on claude-sonnet-4-6, Anthropic rejected it before generation with
 * HTTP 400 "The compiled grammar is too large" at every size tried: the fully-inlined schema
 * (19,633 bytes), a $defs/$ref-deduplicated schema (7,868 bytes, 10 $defs / 16 refs), and a
 * grammar-simplified schema (5,907 bytes, no anyOf/oneOf, max resolved depth 12). Auth, model
 * access, temperature, prefill, and max_tokens were independently ruled out.
 *
 * Instead the system instruction carries a compact output-format description
 * (anthropic-format-instruction.ts) and the text response goes through `parseRawJson` as
 * untrusted `rawOutput: unknown`; canonical Zod parsing + `validateIntelligenceSynthesis` remain
 * the only acceptance path. No tools, no JSON Schema, no assistant prefill, no temperature unless
 * explicitly 1.
 *
 * Non-streaming is safe at max_tokens 32768: the SDK's "Streaming is required" guard only runs
 * when no timeout is configured, and this adapter always passes an explicit client timeout.
 */

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

function textOutput(content: Array<{ readonly type: string; readonly text?: string }>): string | undefined {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

const ANTHROPIC_SAFE_TEMPERATURE = 1;

/**
 * Models released after Claude Opus 4.6 (including claude-sonnet-4-6) only accept
 * `temperature === 1` or an omitted temperature; any other explicit value is rejected by
 * Anthropic with a 400 before generation. Per the reasoningEffort precedent ("reject
 * unsupported levels before any network call... never silently substituted"), an explicitly
 * requested unsupported temperature must fail closed here rather than being silently dropped
 * or clamped, since that would silently change eval sampling semantics.
 */
function validateAnthropicTemperature(temperature: number | undefined): void {
  if (temperature !== undefined && temperature !== ANTHROPIC_SAFE_TEMPERATURE) {
    throw new IntelligenceProviderError(
      'invalid_request',
      `The anthropic model does not accept temperature ${temperature}; only 1 or omitted is supported for models released after Claude Opus 4.6`,
    );
  }
}

export class AnthropicIntelligenceProvider implements IntelligenceModelProvider {
  readonly providerId = 'anthropic';
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(options: ProviderAdapterOptions) {
    const config = validateProviderOptions(options);
    this.modelId = config.modelId;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: ANTHROPIC_BASE_URL,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: IntelligenceRequest<TSchema>,
  ): Promise<IntelligenceResponse> {
    const parameters = normalizeParameters(request.parameters);
    validateAnthropicTemperature(parameters.temperature);
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        system: `${request.systemPrompt}${buildAnthropicOutputFormatInstruction(request.responseSchema)}`,
        messages: [{ role: 'user', content: serializeRequestContext(request) }],
        max_tokens: parameters.maxOutputTokens,
        ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
        ...(parameters.reasoningEffort === undefined
          ? {}
          : { output_config: { effort: parameters.reasoningEffort } }),
      });
      return {
        rawOutput: parseRawJson(textOutput(response.content)),
        telemetry: {
          providerId: this.providerId,
          modelId: this.modelId,
          latencyMs: elapsedMs(startedAt),
          inputTokens: response.usage.input_tokens ?? null,
          outputTokens: response.usage.output_tokens ?? null,
          totalTokens: null,
          estimatedCostUsd: null,
          rawResponseId: response.id ?? null,
          finishReason: response.stop_reason ?? null,
        },
      };
    } catch (error) {
      if (error instanceof APIConnectionTimeoutError) throw normalizedProviderError({ timeout: true });
      if (error instanceof APIConnectionError) throw normalizedProviderError({ status: 503 });
      if (error instanceof APIError) {
        throw normalizedProviderError({
          status: error.status,
          ...(error.requestID ? { providerRequestId: error.requestID } : {}),
          ...(error.type ? { providerErrorCode: error.type } : {}),
        });
      }
      throw error;
    }
  }
}
