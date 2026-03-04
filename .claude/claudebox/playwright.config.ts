import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${process.env.CLAUDEBOX_PORT || "3000"}`,
    httpCredentials: {
      username: process.env.CLAUDEBOX_SESSION_USER || "aztec",
      password: process.env.CLAUDEBOX_SESSION_PASS || "cB!4z73c-xT9mR2q",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
