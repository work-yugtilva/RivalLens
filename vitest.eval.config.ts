import { defineConfig } from 'vitest/config';

// Phase 4A evaluation-harness test suite. Intentionally separate from vitest.config.ts:
// these specs are NEVER collected by `pnpm test:unit` and are NOT wired into CI.
// All specs are mock-only; tests/eval/helpers/no-network.ts fails any real network call.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/eval/**/*.test.ts'],
    setupFiles: ['tests/eval/helpers/no-network.ts'],
  },
});
