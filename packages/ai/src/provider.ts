import type { IntelligenceContext } from '@rivallens/schemas';
import type { z } from 'zod';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export const REASONING_EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORT_LEVELS)[number];

export type IntelligenceModelParameters = {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  /**
   * Optional trusted-benchmark reasoning-effort control. Adapters map it to the
   * provider's native field and reject unsupported levels before any network call.
   * Omitted => the provider/model default (never silently substituted).
   */
  readonly reasoningEffort?: ReasoningEffort;
};

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
// Ceiling only. Reasoning-capable models count thinking tokens against this budget,
// so the per-model `maxOutputTokens` in the benchmark config sets the real spend.
export const MAX_OUTPUT_TOKENS = 32768;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 1;

export type IntelligenceRequest<TSchema extends z.ZodTypeAny> = {
  readonly promptVersion: string;
  readonly systemPrompt: string;
  readonly context: DeepReadonly<IntelligenceContext>;
  readonly contextHash: string;
  readonly responseSchema: TSchema;
  readonly schemaName: string;
  readonly parameters?: IntelligenceModelParameters;
};

export type IntelligenceResponseTelemetry = {
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly estimatedCostUsd: number | null;
  readonly rawResponseId: string | null;
  readonly finishReason: string | null;
};

export type IntelligenceResponse = {
  readonly rawOutput: unknown;
  readonly telemetry: IntelligenceResponseTelemetry;
};

export interface IntelligenceModelProvider {
  readonly providerId: string;
  readonly modelId: string;

  generateStructured<TSchema extends z.ZodTypeAny>(
    request: IntelligenceRequest<TSchema>,
  ): Promise<IntelligenceResponse>;
}

export type IntelligenceProviderErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'authentication_configuration'
  | 'invalid_request'
  | 'provider_exception';

export type IntelligenceProviderErrorMetadata = {
  readonly httpStatus?: number;
  readonly providerRequestId?: string;
  /** Provider-native error status/code string (e.g. Google's `INVALID_ARGUMENT`). Never the free-text message. */
  readonly providerErrorCode?: string;
  /** Dot-path(s) to the offending request/response field, when the provider reports one. Never the violation description. */
  readonly fieldViolationPaths?: readonly string[];
};

export class IntelligenceProviderError extends Error {
  readonly code: IntelligenceProviderErrorCode;
  readonly metadata?: IntelligenceProviderErrorMetadata;

  constructor(
    code: IntelligenceProviderErrorCode,
    message: string,
    metadata?: IntelligenceProviderErrorMetadata,
  ) {
    super(message);
    this.name = 'IntelligenceProviderError';
    this.code = code;
    this.metadata = metadata;
  }
}
