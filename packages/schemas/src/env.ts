import { z } from 'zod';

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const serverEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type Environment = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, env: Environment): z.infer<T> {
  const result = schema.safeParse(env);
  if (result.success) return result.data;

  throw new Error(`Invalid environment: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

export function getPublicEnv(env: Environment = process.env): PublicEnv {
  return parseEnv(publicEnvSchema, env);
}

export function getServerEnv(env: Environment = process.env): ServerEnv {
  return parseEnv(serverEnvSchema, env);
}
