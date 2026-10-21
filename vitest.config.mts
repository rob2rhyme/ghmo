import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      // Next.js provides "server-only" at build time; tests run outside Next.
      { find: /^server-only$/, replacement: `${root}tests/stubs/server-only.ts` }
    ]
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The E2EE library must stay fully tested (plan Phase 3).
      include: ["src/lib/e2ee/**"],
      // Browser-only code (IndexedDB, WebAuthn PRF, React provider) is exercised by the
      // real-browser tests in tests/e2e-auth instead.
      exclude: ["src/lib/e2ee/client/**"],
      thresholds: { statements: 98, branches: 90, functions: 100, lines: 100 }
    }
  }
});
