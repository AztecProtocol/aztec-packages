import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./docs",
  testMatch: "**.spec.ts",
  fullyParallel: true,
  retries: 0,
  workers: 3,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  expect: {
    timeout: 90000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "yarn serve",
    port: 3000,
  },
});
