import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
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

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

function textOutput(content: Array<{ readonly type: string; readonly text?: string }>): string | undefined {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function outputSchema(schema: z.ZodTypeAny): { readonly type: 'object'; readonly [key: string]: unknown } {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as unknown as Record<
    string,
    unknown
  >;
  if (jsonSchema.type !== 'object') {
    throw new IntelligenceProviderError('invalid_request', 'The requested response schema is invalid');
  }
  return jsonSchema as { readonly type: 'object'; readonly [key: string]: unknown };
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
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.modelId,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: serializeRequestContext(request) }],
        max_tokens: parameters.maxOutputTokens,
        ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
        output_config: { format: jsonSchemaOutputFormat(outputSchema(request.responseSchema)) },
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
        });
      }
      throw error;
    }
  }
}
