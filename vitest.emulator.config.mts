import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// Tests that need the Firebase emulators (Firestore rules + auth/session integration).
// Run through `npm run test:emulators`, which starts the emulators (needs Java 11+).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}` },
      { find: /^server-only$/, replacement: `${root}tests/stubs/server-only.ts` }
    ]
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
