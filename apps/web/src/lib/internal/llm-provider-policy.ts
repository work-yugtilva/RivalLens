import 'server-only';

import type {
  FallbackReason,
  IntelligenceModelParameters,
  IntelligenceModelProvider,
  IntelligenceOrchestrationResult,
} from '@rivallens/ai';
import { AnthropicIntelligenceProvider } from '@rivallens/ai/providers/anthropic';
import { GeminiIntelligenceProvider } from '@rivallens/ai/providers/gemini';
import { z } from 'zod';

export type ProductionProviderId = 'anthropic' | 'gemini';

export type ProductionProviderDescriptor = {
  readonly providerId: ProductionProviderId;
  readonly modelId: string;
  readonly parameters: IntelligenceModelParameters;
  readonly timeoutMs: number;
};

export const PRODUCTION_PROVIDER_DESCRIPTORS: Readonly<
  Record<ProductionProviderId, ProductionProviderDescriptor>
> = {
  anthropic: {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    parameters: { maxOutputTokens: 32768, reasoningEffort: 'medium' },
    timeoutMs: 120_000,
  },
  gemini: {
    providerId: 'gemini',
    modelId: 'gemini-3.8-flash',
    parameters: { maxOutputTokens: 32768, reasoningEffort: 'medium' },
    timeoutMs: 30_000,
  },
};

type ProviderFactory = (
  descriptor: ProductionProviderDescriptor,
  apiKey: string,
) => IntelligenceModelProvider;

const runtimeEnvironmentSchema = z
  .object({
    RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER: z.enum(['anthropic', 'gemini']).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
  })
  .passthrough();

export type ProductionProviderSelection =
  | { readonly status: 'disabled' }
  | { readonly status: 'configuration_unavailable'; readonly primaryProviderId: ProductionProviderId }
  | {
      readonly status: 'ready';
      readonly primary: {
        readonly descriptor: ProductionProviderDescriptor;
        readonly provider: IntelligenceModelProvider;
      };
      readonly secondary?: {
        readonly descriptor: ProductionProviderDescriptor;
        readonly provider: IntelligenceModelProvider;
      };
    };

function defaultFactory(
  descriptor: ProductionProviderDescriptor,
  apiKey: string,
): IntelligenceModelProvider {
  const options = { apiKey, modelId: descriptor.modelId, timeoutMs: descriptor.timeoutMs };
  return descriptor.providerId === 'anthropic'
    ? new AnthropicIntelligenceProvider(options)
    : new GeminiIntelligenceProvider(options);
}

export function resolveProductionProviderSelection(
  environment: Record<string, string | undefined> = process.env,
  factory: ProviderFactory = defaultFactory,
): ProductionProviderSelection {
  const parsed = runtimeEnvironmentSchema.parse(environment);
  const primaryProviderId = parsed.RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER;
  if (!primaryProviderId) return { status: 'disabled' };

  const primaryKey =
    primaryProviderId === 'anthropic' ? parsed.ANTHROPIC_API_KEY : parsed.GEMINI_API_KEY;
  if (!primaryKey) return { status: 'configuration_unavailable', primaryProviderId };

  const secondaryProviderId: ProductionProviderId =
    primaryProviderId === 'anthropic' ? 'gemini' : 'anthropic';
  const secondaryKey =
    secondaryProviderId === 'anthropic' ? parsed.ANTHROPIC_API_KEY : parsed.GEMINI_API_KEY;
  const primaryDescriptor = PRODUCTION_PROVIDER_DESCRIPTORS[primaryProviderId];
  const secondaryDescriptor = PRODUCTION_PROVIDER_DESCRIPTORS[secondaryProviderId];
  return {
    status: 'ready',
    primary: {
      descriptor: primaryDescriptor,
      provider: factory(primaryDescriptor, primaryKey),
    },
    ...(secondaryKey
      ? {
          secondary: {
            descriptor: secondaryDescriptor,
            provider: factory(secondaryDescriptor, secondaryKey),
          },
        }
      : {}),
  };
}

export function isCrossProviderFailoverEligible(
  result: IntelligenceOrchestrationResult,
): result is Extract<IntelligenceOrchestrationResult, { status: 'deterministic_fallback' }> & {
  fallbackReason: Extract<FallbackReason, 'PROVIDER_RETRY_EXHAUSTED'>;
} {
  if (
    result.status !== 'deterministic_fallback' ||
    result.fallbackReason !== 'PROVIDER_RETRY_EXHAUSTED'
  ) {
    return false;
  }
  const terminal = result.attempts.at(-1);
  return (
    terminal?.providerFailure === 'timeout' || terminal?.providerFailure === 'provider_unavailable'
  );
}
