import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@rivallens/schemas';

/**
 * Internal operational client. It bypasses RLS and must never authorize a
 * user request; callers must establish tenant access with the RLS-aware
 * client before invoking a scoped internal operation.
 */
export function createInternalSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
