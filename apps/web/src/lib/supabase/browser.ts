'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv, getSupabasePublishableKey } from '@rivallens/schemas';

export function createBrowserSupabaseClient() {
  // Reference NEXT_PUBLIC_* as explicit member accesses so Next inlines them into the client bundle.
  const env = getPublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, getSupabasePublishableKey(env));
}
