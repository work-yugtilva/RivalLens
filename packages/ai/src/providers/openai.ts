import OpenAI from 'openai';
import { toStrictJsonSchema } from 'openai/lib/transform';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import {
  elapsedMs,
  mapOpenAiSdkError,
  normalizeParameters,
  parseRawJson,
  serializeRequestContext,
  stripNullObjectProperties,
  validateProviderOptions,
  type ProviderAdapterOptions,
} from './common';
import {
  IntelligenceProviderError,
  IntelligenceModelProvider,
  IntelligenceRequest,
  IntelligenceResponse,
} from '../provider';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

function makeOptionalPropertiesNullable(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(makeOptionalPropertiesNullable);
  if (!schema || typeof schema !== 'object') return schema;
  const record = schema as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, makeOptionalPropertiesNullable(value)]),
  );
  const properties = result.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return result;
  const required = new Set(Array.isArray(result.required) ? result.required.filter((key): key is string => typeof key === 'string') : []);
  result.properties = Object.fromEntries(
    Object.entries(properties as Record<string, unknown>).map(([key, value]) => [
      key,
      required.has(key) ? value : { anyOf: [value, { type: 'null' }] },
    ]),
  );
  result.required = Object.keys(result.properties as Record<string, unknown>);
  return result;
}

function outputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as unknown as Record<
    string,
    unknown
  >;
  if (jsonSchema.type !== 'object') {
    throw new IntelligenceProviderError('invalid_request', 'The requested response schema is invalid');
  }
  return toStrictJsonSchema(makeOptionalPropertiesNullable(jsonSchema) as never) as Record<string, unknown>;
}

export class OpenAiIntelligenceProvider implements IntelligenceModelProvider {
  readonly providerId = 'openai';
  readonly modelId: string;
  private readonly client: OpenAI;

  constructor(options: ProviderAdapterOptions) {
    const config = validateProviderOptions(options);
    this.modelId = config.modelId;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: OPENAI_BASE_URL,
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
      const response = await this.client.responses.create({
        model: this.modelId,
        instructions: request.systemPrompt,
        input: serializeRequestContext(request),
        max_output_tokens: parameters.maxOutputTokens,
        // GPT-5.x reasoning models reject a non-default temperature unless effort is 'none',
        // so temperature is dropped whenever a reasoning effort is requested.
        ...(parameters.temperature === undefined || parameters.reasoningEffort !== undefined
          ? {}
          : { temperature: parameters.temperature }),
        ...(parameters.reasoningEffort === undefined
          ? {}
          : { reasoning: { effort: parameters.reasoningEffort } }),
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: outputSchema(request.responseSchema),
          },
        },
      });
      return {
        rawOutput: stripNullObjectProperties(parseRawJson(response.output_text)),
        telemetry: {
          providerId: this.providerId,
          modelId: this.modelId,
          latencyMs: elapsedMs(startedAt),
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
          estimatedCostUsd: null,
          rawResponseId: response.id ?? null,
          finishReason: response.incomplete_details?.reason ?? response.status ?? null,
        },
      };
    } catch (error) {
      const mapped = mapOpenAiSdkError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }
}
