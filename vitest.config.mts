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
    include: ["tests/unit/**/*.test.ts"]
  }
});
