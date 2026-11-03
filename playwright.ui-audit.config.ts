import { defineConfig, devices } from "@playwright/test";
import { EMULATOR_ENV } from "./playwright.emulator.config";

// Screenshot run for UI layout audits (docs/PROJECT_PLAN.md §13). Not a pass/fail test: it seeds sample data,
// signs in, and saves every page at phone, tablet and desktop widths in light and dark mode.
// Run with `npm run ui:screens`; images land in UI_AUDIT_OUT (default `ui-audit-screens/`, git-ignored).
const PORT = Number(process.env.E2E_AUTH_PORT ?? 3300);

export default defineConfig({
  testDir: "tests/ui-audit",
  fullyParallel: false,
  workers: 1,
  timeout: 15 * 60_000,
  reporter: "list",
  use: {
    serviceWorkers: "block",
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: EMULATOR_ENV
  }
});
