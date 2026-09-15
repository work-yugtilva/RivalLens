import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Phase 4A evaluation-harness test suite. Intentionally separate from vitest.config.ts:
// these specs are NEVER collected by `pnpm test:unit` and are NOT wired into CI.
// All specs are mock-only; tests/eval/helpers/no-network.ts fails any real network call.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/unit/fixtures/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/eval/**/*.test.ts'],
    setupFiles: ['tests/eval/helpers/no-network.ts'],
  },
});
