import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "@/src/lib/validation";

const schema = z.object({ name: z.string().min(1).max(10) });
const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("parseJsonBody", () => {
  it("returns parsed data", async () => {
    const result = await parseJsonBody(req(JSON.stringify({ name: "ok" })), schema);
    expect(result).toEqual({ ok: true, data: { name: "ok" } });
  });

  it("rejects invalid JSON", async () => {
    const result = await parseJsonBody(req("{nope"), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("rejects schema violations and names the fields without echoing input", async () => {
    const result = await parseJsonBody(req(JSON.stringify({ name: "<script>way too long</script>" })), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(body.fields).toEqual(["name"]);
      expect(JSON.stringify(body)).not.toContain("script");
    }
  });

  it("rejects oversized bodies", async () => {
    const result = await parseJsonBody(req(JSON.stringify({ name: "x".repeat(2000) })), schema, { maxBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});
