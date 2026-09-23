import { defineConfig } from "@playwright/test";

// E2E_BASE_URL=http://localhost:5173 npm run e2e   → against `npm run dev`
// npm run e2e                                      → against the live Worker
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    headless: true,
    viewport: { width: 1400, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
});
