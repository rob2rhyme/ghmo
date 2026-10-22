import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/src/features/docgen/templates";

describe("document templates", () => {
  it("each has a unique id and a positive integer version", () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) expect(Number.isInteger(template.version) && template.version >= 1).toBe(true);
  });
});
