import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 90000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'yarn serve',
    port: 5173,
  },
});
