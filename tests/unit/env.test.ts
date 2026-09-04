import { describe, expect, it } from 'vitest';
import { getPublicEnv, getServerEnv } from '../../packages/schemas/src';

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
};

describe('environment validation', () => {
  it('accepts browser-safe environment values', () => {
    expect(getPublicEnv(publicEnv)).toEqual(publicEnv);
  });

  it('rejects missing server-only values', () => {
    expect(() => getServerEnv(publicEnv)).toThrow('Invalid environment');
  });

  it('accepts complete server environment values', () => {
    expect(
      getServerEnv({
        ...publicEnv,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }),
    ).toMatchObject(publicEnv);
  });
});
