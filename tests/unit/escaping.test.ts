import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/src/features/docgen/render/renderTemplateHtml";
import { normalizeMemberEmail } from "@/src/lib/members";

describe("escapeHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml("")).toBe("");
  });
});

describe("normalizeMemberEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeMemberEmail("  Admin@Example.ORG ")).toBe("admin@example.org");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeMemberEmail("   ")).toBe("");
    expect(normalizeMemberEmail(undefined)).toBe("");
  });
});
