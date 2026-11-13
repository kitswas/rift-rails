import { defineConfig } from "@playwright/test";

// @types/node is not installed in this repo; only the CI flag is needed here.
declare const process: { env: { CI?: string } };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 2 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8100",
    trace: "on-first-retry",
  },
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: "pnpm build && pnpm preview:e2e",
    url: "http://127.0.0.1:8100",
    reuseExistingServer: false,
    timeout: 60 * 1000,
  },
});
