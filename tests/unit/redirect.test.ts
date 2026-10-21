import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/src/lib/security/redirect";

describe("safeRedirectPath", () => {
  it.each(["/admin", "/admin/minutes?tab=records", "/c/ghmo/events#top"])("keeps same-origin path %s", path => {
    expect(safeRedirectPath(path, "/admin")).toBe(path);
  });

  it.each([
    "//evil.com",
    "//evil.com/admin",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "admin",
    "/\t/evil.com",
    "",
    null,
    undefined
  ])("rejects %s", value => {
    expect(safeRedirectPath(value, "/admin")).toBe("/admin");
  });
});
