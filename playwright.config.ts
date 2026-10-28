import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

// third-party-isolation.spec.ts needs a marker "third-party" script baked into the build
// (NEXT_PUBLIC_ values are inlined at build time). Build for e2e with:
//   NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET='window.__THIRD_PARTY_MARKER__=1;' npm run build

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // The service worker is tested on its own (pwa.spec.ts); elsewhere it would only add caching noise.
    serviceWorkers: "block",
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    // Runs the production build; `npm run build` must run first.
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
