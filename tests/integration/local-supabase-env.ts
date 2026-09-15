import { execFileSync } from 'node:child_process';

type LocalSupabaseStatus = {
  API_URL: string;
  DB_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

let status: LocalSupabaseStatus;
try {
  status = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as LocalSupabaseStatus;
} catch {
  throw new Error('Local Supabase is required. Run `pnpm db:start` and `pnpm db:reset` first.');
}

process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
process.env.DATABASE_URL = status.DB_URL;
