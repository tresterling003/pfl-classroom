import os from "node:os";
import { defineConfig, devices } from "@playwright/test";

// Run against an already-running server with E2E_BASE_URL, or let Playwright start a dev server.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? "http://localhost:3200",
    viewport: { width: 1366, height: 768 }, // typical Chromebook
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } }],
  webServer: external
    ? undefined
    : {
        command: "npx next dev -p 3200",
        url: "http://localhost:3200",
        timeout: 180_000,
        reuseExistingServer: true,
        env: { PGLITE_DIR: os.tmpdir() + "/pfl-e2e-pglite", TEACHER_SETUP_CODE: process.env.TEACHER_SETUP_CODE ?? "e2e-setup-code" },
      },
});
