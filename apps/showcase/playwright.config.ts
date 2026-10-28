import { defineConfig } from "@playwright/test";

/**
 * The end-to-end flow runs against a real service serving the built showcase on one origin, started from a fresh
 * store with the public demonstration bundle (see scripts/run-e2e.sh). It uses the installed Google Chrome.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-report.json" }]],
  use: {
    baseURL: process.env.ELIGIBILITY_LAB_URL ?? "http://127.0.0.1:8765",
    channel: "chrome",
    headless: true,
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
});
