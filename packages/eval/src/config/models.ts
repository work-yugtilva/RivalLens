import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MAX_PROVIDER_TIMEOUT_MS } from '@rivallens/ai/providers/common';
import {
  MAX_OUTPUT_TOKENS,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  REASONING_EFFORT_LEVELS,
  type ReasoningEffort,
} from '@rivallens/ai';

export const SUPPORTED_PROVIDER_IDS = [
  'deterministic-mock',
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'kimi',
  'glm',
  'qwen',
] as const;
export type SupportedProviderId = (typeof SUPPORTED_PROVIDER_IDS)[number];

export const LIVE_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'kimi',
  'glm',
  'qwen',
] as const;
export type LiveProviderId = (typeof LIVE_PROVIDER_IDS)[number];

// Mirrors REASONING_EFFORT_LEVELS from @rivallens/ai (the common cross-provider control).
const reasoningEffortSchema = z.enum(
  REASONING_EFFORT_LEVELS as unknown as [ReasoningEffort, ...ReasoningEffort[]],
);

export const structuredOutputModeSchema = z.enum([
  // Server-enforced strict JSON Schema (constrained decoding against the full schema).
  'strict_json_schema',
  // Server-enforced JSON Schema without strict-mode guarantees.
  'json_schema',
  // JSON requested without a server-enforced JSON Schema: the expected structure is described
  // in-band (prompt), and the provider may or may not guarantee syntactically valid JSON.
  'json_object',
]);
export type StructuredOutputMode = z.infer<typeof structuredOutputModeSchema>;

export const modelConfigEntrySchema = z
  .object({
    // The trusted allowlist key. --models selects by this ALONE.
    alias: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, 'alias must be kebab-case'),
    providerId: z.enum(SUPPORTED_PROVIDER_IDS),
    modelId: z.string().min(1),
    // Omitted for models that reject a temperature control (reasoning-only models).
    temperature: z.number().min(MIN_TEMPERATURE).max(MAX_TEMPERATURE).optional(),
    maxOutputTokens: z.number().int().min(1).max(MAX_OUTPUT_TOKENS),
    runsPerFixture: z.number().int().min(1).max(20),
    // Optional trusted-benchmark reasoning-effort for this model (CLI --reasoning-effort overrides).
    reasoningEffort: reasoningEffortSchema.optional(),
    // Capability metadata. Drives pre-network guards and explains benchmark differences.
    supportedReasoningEfforts: z.array(reasoningEffortSchema).default([]),
    structuredOutputMode: structuredOutputModeSchema.optional(),
    temperatureSupported: z.boolean().default(true),
    // Per-model client request timeout for live runs. Omitted => DEFAULT_PROVIDER_TIMEOUT_MS.
    // Bounded by the adapter's own MAX_PROVIDER_TIMEOUT_MS ceiling; never raised here.
    timeoutMs: z.number().int().min(1).max(MAX_PROVIDER_TIMEOUT_MS).optional(),
  })
  .strict();

export const modelConfigSchema = z
  .object({
    configVersion: z.string().min(1),
    note: z.string().optional(),
    models: z
      .array(modelConfigEntrySchema)
      .min(1)
      .refine(
        (list) => new Set(list.map((entry) => entry.alias)).size === list.length,
        'model aliases must be unique',
      ),
  })
  .strict();

export type ModelConfigEntry = z.infer<typeof modelConfigEntrySchema>;
export type ModelConfig = z.infer<typeof modelConfigSchema>;

export function loadModelConfig(raw: unknown): ModelConfig {
  return modelConfigSchema.parse(raw);
}

export const MODELS_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'config',
  'models.json',
);

export function loadModelConfigFromDisk(path: string = MODELS_PATH): ModelConfig {
  return loadModelConfig(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

const PLACEHOLDER_MODEL_ID = /REPLACE_WITH/i;

export function isPlaceholderModel(entry: ModelConfigEntry): boolean {
  return PLACEHOLDER_MODEL_ID.test(entry.modelId);
}

/**
 * Resolve `--models` tokens against the trusted config. Tokens are model configuration
 * ALIASES only: never `provider:modelId`, never an arbitrary model id, never a base URL.
 * An empty / omitted selection returns every configured model.
 */
export function selectModels(
  config: ModelConfig,
  aliases?: readonly string[],
): ModelConfigEntry[] {
  if (!aliases || aliases.length === 0) return [...config.models];
  const byAlias = new Map(config.models.map((entry) => [entry.alias, entry]));
  const available = [...byAlias.keys()].join(', ');
  const selected: ModelConfigEntry[] = [];
  for (const token of aliases) {
    if (/[:/]/.test(token)) {
      throw new Error(
        `--models takes trusted config aliases only (got "${token}"). Available aliases: ${available}`,
      );
    }
    const entry = byAlias.get(token);
    if (!entry) {
      throw new Error(`unknown model alias "${token}". Available aliases: ${available}`);
    }
    if (!selected.includes(entry)) selected.push(entry);
  }
  return selected;
}

/** A model must be identity-present in the trusted config to run at all. */
export function assertModelIsTrusted(entry: ModelConfigEntry, config: ModelConfig): void {
  if (!config.models.includes(entry)) {
    throw new Error(`model alias "${entry.alias}" is not part of the trusted benchmark config`);
  }
}

/**
 * Reject a requested reasoning-effort level the selected model does not support, BEFORE any
 * provider is constructed or any paid network call is made. Never silently substitutes.
 */
export function assertReasoningEffortSupported(
  entry: ModelConfigEntry,
  effort: ReasoningEffort,
): void {
  if (!entry.supportedReasoningEfforts.includes(effort)) {
    const supported = entry.supportedReasoningEfforts.length
      ? entry.supportedReasoningEfforts.join(', ')
      : 'none';
    throw new Error(
      `model alias "${entry.alias}" does not support reasoning effort "${effort}" (supported: ${supported})`,
    );
  }
}

/** Extra gate before a LIVE run: reject the mock and unresolved placeholder model ids. */
export function assertLiveModelReady(entry: ModelConfigEntry): void {
  if (entry.providerId === 'deterministic-mock') {
    throw new Error(`model alias "${entry.alias}" is the deterministic mock and cannot run --live`);
  }
  if (isPlaceholderModel(entry)) {
    throw new Error(
      `model alias "${entry.alias}" still has a placeholder modelId ("${entry.modelId}"). ` +
        'Set a currently-valid official provider identifier in packages/eval/config/models.json before --live.',
    );
  }
}
