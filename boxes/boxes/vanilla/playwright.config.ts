import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 50_000 },
  timeout: 400_000,
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'PORT=3000 yarn serve',
    port: 3000,
    timeout: 30_000,
  },
});
