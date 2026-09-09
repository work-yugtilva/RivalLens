import type { IntelligenceContext } from '@rivallens/schemas';
import type { z } from 'zod';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type IntelligenceModelParameters = {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
};

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
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
  readonly rawResponseId?: string;
  readonly finishReason?: string;
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

export type IntelligenceProviderErrorCode = 'provider_exception' | 'timeout';

export class IntelligenceProviderError extends Error {
  readonly code: IntelligenceProviderErrorCode;

  constructor(code: IntelligenceProviderErrorCode, message: string) {
    super(message);
    this.name = 'IntelligenceProviderError';
    this.code = code;
  }
}
