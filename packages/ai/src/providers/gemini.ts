import { ApiError, GoogleGenAI } from '@google/genai';
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
import type {
  IntelligenceModelProvider,
  IntelligenceRequest,
  IntelligenceResponse,
} from '../provider';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

function textOutput(candidates: Array<{ readonly content?: { readonly parts?: Array<{ text?: string }> } }> | undefined): string | undefined {
  return candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');
}

export class GeminiIntelligenceProvider implements IntelligenceModelProvider {
  readonly providerId = 'gemini';
  readonly modelId: string;
  private readonly client: GoogleGenAI;

  constructor(options: ProviderAdapterOptions) {
    const config = validateProviderOptions(options);
    this.modelId = config.modelId;
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      vertexai: false,
      httpOptions: {
        baseUrl: GEMINI_BASE_URL,
        timeout: config.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: IntelligenceRequest<TSchema>,
  ): Promise<IntelligenceResponse> {
    const parameters = normalizeParameters(request.parameters);
    const startedAt = Date.now();
    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: serializeRequestContext(request),
        config: {
          systemInstruction: request.systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: zodToJsonSchema(request.responseSchema, {
            $refStrategy: 'none',
          }),
          maxOutputTokens: parameters.maxOutputTokens,
          ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
          httpOptions: { retryOptions: { attempts: 1 } },
        },
      });
      return {
        rawOutput: parseRawJson(textOutput(response.candidates)),
        telemetry: {
          providerId: this.providerId,
          modelId: this.modelId,
          latencyMs: elapsedMs(startedAt),
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          totalTokens: response.usageMetadata?.totalTokenCount ?? null,
          estimatedCostUsd: null,
          rawResponseId: response.responseId ?? null,
          finishReason: response.candidates?.[0]?.finishReason ?? null,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw normalizedProviderError({ timeout: true });
      }
      if (error instanceof ApiError) {
        throw normalizedProviderError({ status: error.status });
      }
      throw error;
    }
  }
}
