import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Regression test for a production crash: firebase-admin's auth module loads jwks-rsa, and
 * jwks-rsa 4 requires an ES-module-only jose. On a Node runtime without require(esm) the whole
 * server-rendered page failed with ERR_REQUIRE_ESM. The jwks-rsa override in package.json
 * keeps it on a CommonJS-compatible jose. This loads the module with require(esm) switched off.
 */
describe("firebase-admin auth module", () => {
  it("loads on a Node runtime that cannot require() ES modules", () => {
    const result = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", "require('firebase-admin/auth')"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });
    expect(result.stderr).not.toContain("ERR_REQUIRE_ESM");
    expect(result.status).toBe(0);
  });
});
