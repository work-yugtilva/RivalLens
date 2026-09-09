import {
  intelligenceContextSchema,
  llmIntelligenceSynthesisOutputSchema,
  type IntelligenceContext,
} from '@rivallens/schemas';
import {
  intelligenceContextHash,
  validateIntelligenceSynthesis,
  type IntelligenceValidationResult,
} from '@rivallens/intelligence';
import {
  IntelligenceProviderError,
  type DeepReadonly,
  type IntelligenceModelParameters,
  type IntelligenceModelProvider,
  type IntelligenceProviderErrorCode,
  type IntelligenceProviderErrorMetadata,
  type IntelligenceResponseTelemetry,
} from './provider';

const INTELLIGENCE_SYNTHESIS_SCHEMA_NAME = 'llm-intelligence-synthesis-v1';

export type GenerateIntelligenceInput = {
  context: IntelligenceContext;
  contextHash: string;
  provider: IntelligenceModelProvider;
  promptVersion: string;
  systemPrompt: string;
  parameters?: IntelligenceModelParameters;
};

type ContextFailure = {
  kind: 'context_failure';
  code: 'CONTEXT_HASH_MISMATCH' | 'INVALID_CONTEXT';
  actualContextHash?: string;
  errors?: Array<{ path: Array<string | number>; message: string }>;
};

type ProviderFailure = {
  kind: 'provider_failure';
  code: IntelligenceProviderErrorCode;
  providerId: string;
  modelId: string;
  message: string;
  metadata?: IntelligenceProviderErrorMetadata;
};

type ValidatedIntelligence = {
  kind: 'validated';
  rawOutput: unknown;
  telemetry: IntelligenceResponseTelemetry;
  validation: IntelligenceValidationResult;
};

export type GenerateIntelligenceResult = ContextFailure | ProviderFailure | ValidatedIntelligence;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export async function generateIntelligence(
  input: GenerateIntelligenceInput,
): Promise<GenerateIntelligenceResult> {
  const actualContextHash = intelligenceContextHash(input.context);
  if (actualContextHash !== input.contextHash) {
    return {
      kind: 'context_failure',
      code: 'CONTEXT_HASH_MISMATCH',
      actualContextHash,
    };
  }

  const parsedContext = intelligenceContextSchema.safeParse(input.context);
  if (!parsedContext.success) {
    return {
      kind: 'context_failure',
      code: 'INVALID_CONTEXT',
      errors: parsedContext.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  const context = deepFreeze(structuredClone(parsedContext.data));
  try {
    const response = await input.provider.generateStructured({
      promptVersion: input.promptVersion,
      systemPrompt: input.systemPrompt,
      context,
      contextHash: input.contextHash,
      responseSchema: llmIntelligenceSynthesisOutputSchema,
      schemaName: INTELLIGENCE_SYNTHESIS_SCHEMA_NAME,
      ...(input.parameters ? { parameters: input.parameters } : {}),
    });
    return {
      kind: 'validated',
      rawOutput: response.rawOutput,
      telemetry: response.telemetry,
      validation: validateIntelligenceSynthesis({ context, output: response.rawOutput }),
    };
  } catch (error) {
    const providerError = error instanceof IntelligenceProviderError ? error : undefined;
    return {
      kind: 'provider_failure',
      code: providerError?.code ?? 'provider_exception',
      providerId: input.provider.providerId,
      modelId: input.provider.modelId,
      message: providerError?.message ?? 'The intelligence provider failed to generate output',
      ...(providerError?.metadata ? { metadata: providerError.metadata } : {}),
    };
  }
}
