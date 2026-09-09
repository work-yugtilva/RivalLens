import { z } from 'zod';

const publicEnvBase = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Modern browser-safe key. Preferred. Legacy anon key kept as a fallback.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

const hasBrowserKey = (env: z.infer<typeof publicEnvBase>) =>
  Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const publicEnvSchema = publicEnvBase.refine(hasBrowserKey, {
  message: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  path: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
});

export const serverEnvSchema = publicEnvBase
  .extend({
    DATABASE_URL: z.string().url(),
    // Modern server-only key. Preferred. Legacy service-role key kept as a fallback.
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  })
  .refine(hasBrowserKey, {
    message: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    path: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  })
  .refine((env) => Boolean(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY), {
    message: 'SUPABASE_SERVICE_ROLE_KEY',
    path: ['SUPABASE_SERVICE_ROLE_KEY'],
  });

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type Environment = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, env: Environment): z.infer<T> {
  const result = schema.safeParse(env);
  if (result.success) return result.data;

  throw new Error(
    `Invalid environment: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}

export function getPublicEnv(env: Environment = process.env): PublicEnv {
  return parseEnv(publicEnvSchema, env);
}

export function getServerEnv(env: Environment = process.env): ServerEnv {
  return parseEnv(serverEnvSchema, env);
}

/** Browser-safe Supabase key: modern publishable key preferred, legacy anon key as fallback. */
export function getSupabasePublishableKey(env: PublicEnv): string {
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Invalid environment: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  return key;
}

/** Server-only Supabase key: modern secret key preferred, legacy service-role key as fallback. */
export function getSupabaseSecretKey(env: ServerEnv): string {
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Invalid environment: SUPABASE_SERVICE_ROLE_KEY');
  return key;
}
