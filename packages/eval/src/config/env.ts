import { z } from 'zod';
import type { LiveProviderId } from './models';

// API keys enter the process ONLY through the environment, and ONLY for a --live run.
// Not read by the app, `pnpm test:unit`, `pnpm test:eval`, or CI. Never stored in any artifact.
export const PROVIDER_ENV_KEYS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  glm: 'ZAI_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
} as const satisfies Record<LiveProviderId, string>;

const liveEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  MOONSHOT_API_KEY: z.string().min(1).optional(),
  ZAI_API_KEY: z.string().min(1).optional(),
  DASHSCOPE_API_KEY: z.string().min(1).optional(),
});

export type EvalLiveEnv = z.infer<typeof liveEnvSchema>;
type Environment = Record<string, string | undefined>;

export function getEvalLiveEnv(env: Environment = process.env): EvalLiveEnv {
  const parsed = liveEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}

/**
 * Return the API key for each selected live provider. Throws — naming ONLY the missing
 * variables for the SELECTED providers — if any is absent.
 */
export function requireKeysForProviders(
  providerIds: readonly LiveProviderId[],
  env: Environment = process.env,
): Record<LiveProviderId, string> {
  const live = getEvalLiveEnv(env);
  const keys: Partial<Record<LiveProviderId, string>> = {};
  const missing: string[] = [];
  for (const providerId of providerIds) {
    const variableName = PROVIDER_ENV_KEYS[providerId];
    const value = live[variableName];
    if (!value) missing.push(`${variableName} (provider "${providerId}")`);
    else keys[providerId] = value;
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing credentials for live run: ${missing.join(', ')}. ` +
        'Set them, or deselect the provider with --models.',
    );
  }
  return keys as Record<LiveProviderId, string>;
}
