import type { z } from 'zod';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  IntelligenceProviderError,
  MAX_OUTPUT_TOKENS,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  type IntelligenceModelParameters,
  type IntelligenceProviderErrorCode,
  type IntelligenceProviderErrorMetadata,
  type IntelligenceRequest,
} from '../provider';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const MAX_PROVIDER_TIMEOUT_MS = 120_000;

export type ProviderAdapterOptions = {
  readonly apiKey: string;
  readonly modelId: string;
  readonly timeoutMs?: number;
};

export type NormalizedModelParameters = {
  readonly maxOutputTokens: number;
  readonly temperature?: number;
};

export function validateProviderOptions(options: ProviderAdapterOptions): Required<ProviderAdapterOptions> {
  if (options.apiKey.trim().length === 0 || options.modelId.trim().length === 0) {
    throw new IntelligenceProviderError(
      'authentication_configuration',
      'The intelligence provider credentials or model configuration are invalid',
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_PROVIDER_TIMEOUT_MS) {
    throw new IntelligenceProviderError(
      'authentication_configuration',
      'The intelligence provider timeout configuration is invalid',
    );
  }
  return { apiKey: options.apiKey, modelId: options.modelId, timeoutMs };
}

export function normalizeParameters(
  parameters: IntelligenceModelParameters | undefined,
): NormalizedModelParameters {
  const maxOutputTokens = parameters?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > MAX_OUTPUT_TOKENS
  ) {
    throw new IntelligenceProviderError(
      'invalid_request',
      'The requested output token limit is invalid',
    );
  }
  const temperature = parameters?.temperature;
  if (
    temperature !== undefined &&
    (!Number.isFinite(temperature) || temperature < MIN_TEMPERATURE || temperature > MAX_TEMPERATURE)
  ) {
    throw new IntelligenceProviderError(
      'invalid_request',
      'The requested temperature is invalid',
    );
  }
  return { maxOutputTokens, ...(temperature === undefined ? {} : { temperature }) };
}

export function serializeRequestContext<TSchema extends z.ZodTypeAny>(
  request: IntelligenceRequest<TSchema>,
): string {
  return JSON.stringify({ contextHash: request.contextHash, context: request.context });
}

export function parseRawJson(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function stripNullObjectProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullObjectProperties);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== null)
      .map(([key, nested]) => [key, stripNullObjectProperties(nested)]),
  );
}

function failureMessage(code: IntelligenceProviderErrorCode): string {
  switch (code) {
    case 'timeout':
      return 'The intelligence provider request timed out';
    case 'rate_limit':
      return 'The intelligence provider rate limit was reached';
    case 'provider_unavailable':
      return 'The intelligence provider is temporarily unavailable';
    case 'authentication_configuration':
      return 'The intelligence provider credentials or configuration were rejected';
    case 'invalid_request':
      return 'The intelligence provider rejected the request';
    case 'provider_exception':
      return 'The intelligence provider failed to generate output';
  }
}

export function normalizedProviderError(input: {
  readonly status?: number;
  readonly providerRequestId?: string;
  readonly timeout?: boolean;
}): IntelligenceProviderError {
  const code: IntelligenceProviderErrorCode = input.timeout
    ? 'timeout'
    : input.status === 408 || input.status === 504
      ? 'timeout'
      : input.status === 429
        ? 'rate_limit'
        : input.status === 401 || input.status === 403
          ? 'authentication_configuration'
          : input.status !== undefined && input.status >= 500
            ? 'provider_unavailable'
            : input.status !== undefined && input.status >= 400
              ? 'invalid_request'
              : 'provider_exception';
  const metadata: IntelligenceProviderErrorMetadata = {
    ...(input.status === undefined ? {} : { httpStatus: input.status }),
    ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
  };
  return new IntelligenceProviderError(
    code,
    failureMessage(code),
    Object.keys(metadata).length === 0 ? undefined : metadata,
  );
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
