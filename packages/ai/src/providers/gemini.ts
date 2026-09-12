import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import {
  deduplicateGeminiTransportSchema,
  projectToGeminiTransportSchema,
  zodToGeminiCandidateSchema,
} from './gemini-schema-projection';
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
  ReasoningEffort,
} from '../provider';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

const THINKING_LEVEL_BY_EFFORT: Readonly<Record<ReasoningEffort, ThinkingLevel>> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function textOutput(candidates: Array<{ readonly content?: { readonly parts?: Array<{ text?: string }> } }> | undefined): string | undefined {
  return candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');
}

// Google's SDK sets `ApiError.message` to `JSON.stringify(errorBody)` of the standard API
// error envelope (see `throwErrorIfNotOK` in `@google/genai`). This guard extracts only the
// generic status enum and field-violation paths -- never the free-text `message`, which can
// echo request content -- and yields nothing on any unexpected shape.
const googleErrorDetailSchema = z.object({
  fieldViolations: z.array(z.object({ field: z.string().optional() })).optional(),
  // `google.rpc.ErrorInfo` shape: `.reason` is a short machine-readable label, never the
  // free-text `.domain`/`.metadata`, which can carry echoed request content.
  reason: z.string().optional(),
});

const googleErrorEnvelopeSchema = z.object({
  error: z
    .object({
      status: z.string().optional(),
      details: z.array(googleErrorDetailSchema).optional(),
    })
    .optional(),
});

function safeGeminiErrorDiagnostics(
  error: ApiError,
): { readonly providerErrorCode?: string; readonly fieldViolationPaths?: readonly string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(error.message) as unknown;
  } catch {
    return {};
  }
  const result = googleErrorEnvelopeSchema.safeParse(parsed);
  if (!result.success || !result.data.error) return {};
  const fieldViolationPaths = result.data.error.details
    ?.flatMap((detail) => detail.fieldViolations ?? [])
    .map((violation) => violation.field)
    .filter((field): field is string => typeof field === 'string' && field.length > 0);
  // A `google.rpc.ErrorInfo` `.reason` is a more specific machine label than the top-level
  // `.status`; prefer it when present, falling back to `.status`.
  const reason = result.data.error.details?.find((detail) => detail.reason)?.reason;
  const providerErrorCode = reason ?? result.data.error.status;
  return {
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(fieldViolationPaths && fieldViolationPaths.length > 0 ? { fieldViolationPaths } : {}),
  };
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
          responseJsonSchema: deduplicateGeminiTransportSchema(
            projectToGeminiTransportSchema(zodToGeminiCandidateSchema(request.responseSchema)),
          ),
          maxOutputTokens: parameters.maxOutputTokens,
          ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
          ...(parameters.reasoningEffort === undefined
            ? {}
            : { thinkingConfig: { thinkingLevel: THINKING_LEVEL_BY_EFFORT[parameters.reasoningEffort] } }),
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
        throw normalizedProviderError({ status: error.status, ...safeGeminiErrorDiagnostics(error) });
      }
      throw error;
    }
  }
}
