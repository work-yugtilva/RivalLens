import { describe, expect, it } from 'vitest';
import {
  getPublicEnv,
  getServerEnv,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
} from '../../packages/schemas/src';

const url = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };
const publishableEnv = { ...url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const anonEnv = { ...url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' };
const serverExtras = { DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' };

describe('environment validation', () => {
  it('accepts a browser environment with the modern publishable key', () => {
    expect(getPublicEnv(publishableEnv).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      'sb_publishable_test',
    );
    expect(getSupabasePublishableKey(getPublicEnv(publishableEnv))).toBe('sb_publishable_test');
  });

  it('still accepts a browser environment with only the legacy anon key', () => {
    expect(getPublicEnv(anonEnv).NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key');
    expect(getSupabasePublishableKey(getPublicEnv(anonEnv))).toBe('anon-key');
  });

  it('prefers the publishable key over the anon key', () => {
    const env = getPublicEnv({ ...publishableEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' });
    expect(getSupabasePublishableKey(env)).toBe('sb_publishable_test');
  });

  it('rejects a browser environment with no publishable or anon key', () => {
    expect(() => getPublicEnv(url)).toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('rejects missing server-only values', () => {
    expect(() => getServerEnv(publishableEnv)).toThrow('Invalid environment');
  });

  it('accepts a server environment with the modern secret key', () => {
    const env = getServerEnv({
      ...publishableEnv,
      ...serverExtras,
      SUPABASE_SECRET_KEY: 'sb_secret_test',
    });
    expect(getSupabaseSecretKey(env)).toBe('sb_secret_test');
  });

  it('still accepts a server environment with only the legacy service-role key', () => {
    const env = getServerEnv({
      ...anonEnv,
      ...serverExtras,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });
    expect(getSupabaseSecretKey(env)).toBe('service-role-key');
  });

  it('rejects a server environment with no secret or service-role key', () => {
    expect(() => getServerEnv({ ...publishableEnv, ...serverExtras })).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
  });
});
