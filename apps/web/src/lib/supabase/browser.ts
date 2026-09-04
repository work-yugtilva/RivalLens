'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from '@rivallens/schemas';

export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
