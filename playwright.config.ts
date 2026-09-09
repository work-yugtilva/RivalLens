import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/frontend',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  outputDir: '/tmp/rivallens-qa-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3002',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @rivallens/web dev --port 3002',
    url: 'http://localhost:3002/overview/preview/complete',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
