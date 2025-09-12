import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.PLAYWRIGHT_NUM_WORKERS
    ? Number(process.env.PLAYWRIGHT_NUM_WORKERS)
    : 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  expect: {
    timeout: 50_000,
  },
  timeout: 400_000,
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox is too slow in playwright during proof generation.
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],

  webServer: {
    command: 'PORT=3000 yarn serve',
    port: 3000,
    timeout: 30_000,
  },
});
