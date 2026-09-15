import { describe, expect, it, vi } from 'vitest';
import type {
  IntelligenceModelProvider,
  IntelligenceOrchestrationResult,
} from '../../packages/ai/src';
import {
  PRODUCTION_PROVIDER_DESCRIPTORS,
  isCrossProviderFailoverEligible,
  resolveProductionProviderSelection,
} from '../../apps/web/src/lib/internal/llm-provider-policy';

vi.mock('server-only', () => ({}));

function provider(providerId: string, modelId: string): IntelligenceModelProvider {
  return {
    providerId,
    modelId,
    async generateStructured() {
      throw new Error('not invoked by policy tests');
    },
  };
}

describe('production LLM provider policy', () => {
  it.each([
    ['anthropic', 'gemini'],
    ['gemini', 'anthropic'],
  ] as const)('selects a pinned %s primary and %s secondary', (primaryId, secondaryId) => {
    const constructed: string[] = [];
    const selection = resolveProductionProviderSelection(
      {
        RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER: primaryId,
        ANTHROPIC_API_KEY: 'anthropic-secret',
        GEMINI_API_KEY: 'gemini-secret',
      },
      (descriptor) => {
        constructed.push(`${descriptor.providerId}:${descriptor.modelId}`);
        return provider(descriptor.providerId, descriptor.modelId);
      },
    );

    expect(selection.status).toBe('ready');
    if (selection.status !== 'ready') return;
    expect(selection.primary.descriptor.providerId).toBe(primaryId);
    expect(selection.secondary?.descriptor.providerId).toBe(secondaryId);
    expect(constructed).toEqual([
      `${primaryId}:${PRODUCTION_PROVIDER_DESCRIPTORS[primaryId].modelId}`,
      `${secondaryId}:${PRODUCTION_PROVIDER_DESCRIPTORS[secondaryId].modelId}`,
    ]);
  });

  it('is disabled when no server-side selector is configured', () => {
    expect(resolveProductionProviderSelection({})).toEqual({ status: 'disabled' });
  });

  it('does not promote a configured secondary when the primary credential is missing', () => {
    expect(
      resolveProductionProviderSelection({
        RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER: 'anthropic',
        GEMINI_API_KEY: 'gemini-secret',
      }),
    ).toEqual({ status: 'configuration_unavailable', primaryProviderId: 'anthropic' });
  });

  it('fails closed on unsupported selectors', () => {
    expect(() =>
      resolveProductionProviderSelection({
        RIVALLENS_INTELLIGENCE_PRIMARY_PROVIDER: 'openai',
        OPENAI_API_KEY: 'not-a-production-candidate',
      }),
    ).toThrow();
  });

  it.each([
    ['timeout', true],
    ['provider_unavailable', true],
    ['rate_limit', false],
    ['authentication_configuration', false],
    ['invalid_request', false],
    ['provider_exception', false],
  ] as const)('allows cross-provider failover for terminal %s: %s', (failure, expected) => {
    const result = {
      status: 'deterministic_fallback',
      fallbackReason: 'PROVIDER_RETRY_EXHAUSTED',
      acceptedOutput: {},
      attempts: [{ attemptNumber: 2, kind: 'retry', providerFailure: failure }],
    } as unknown as IntelligenceOrchestrationResult;
    expect(isCrossProviderFailoverEligible(result)).toBe(expected);
  });

  it('does not model-shop after validation exhaustion', () => {
    const result = {
      status: 'deterministic_fallback',
      fallbackReason: 'VALIDATION_REPAIR_EXHAUSTED',
      acceptedOutput: {},
      attempts: [{ attemptNumber: 2, kind: 'retry', providerFailure: 'timeout' }],
    } as unknown as IntelligenceOrchestrationResult;
    expect(isCrossProviderFailoverEligible(result)).toBe(false);
  });
});
