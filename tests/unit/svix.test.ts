import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvixSignature } from "@/src/lib/svix";

const raw = crypto.randomBytes(24);
const secret = `whsec_${raw.toString("base64")}`;
const body = '{"type":"email.bounced"}';
const now = 1_800_000_000_000;
const stamp = String(now / 1000);
const sign = (id: string, ts: string, text: string, key = raw) => `v1,${crypto.createHmac("sha256", key).update(`${id}.${ts}.${text}`).digest("base64")}`;
const base = { id: "msg_1", timestamp: stamp, signature: sign("msg_1", stamp, body), body, secret, nowMs: now };

describe("verifySvixSignature", () => {
  it("accepts a correctly signed, recent request", () => {
    expect(verifySvixSignature(base)).toBe(true);
  });

  it("accepts when any of several signatures matches (key rotation)", () => {
    expect(verifySvixSignature({ ...base, signature: `v1,${Buffer.from("nope").toString("base64")} ${base.signature}` })).toBe(true);
  });

  it("refuses a changed body, id, or timestamp", () => {
    expect(verifySvixSignature({ ...base, body: '{"type":"email.complained"}' })).toBe(false);
    expect(verifySvixSignature({ ...base, id: "msg_2" })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: String(now / 1000 + 1) })).toBe(false);
  });

  it("refuses the wrong secret and unknown signature versions", () => {
    expect(verifySvixSignature({ ...base, secret: `whsec_${crypto.randomBytes(24).toString("base64")}` })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: base.signature.replace("v1,", "v2,") })).toBe(false);
  });

  it("refuses requests outside the time window (replay)", () => {
    expect(verifySvixSignature({ ...base, nowMs: now + 301_000 })).toBe(false);
    expect(verifySvixSignature({ ...base, nowMs: now - 301_000 })).toBe(false);
    expect(verifySvixSignature({ ...base, nowMs: now + 299_000 })).toBe(true);
  });

  it("refuses missing or malformed input", () => {
    expect(verifySvixSignature({ ...base, id: null })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: null })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: null })).toBe(false);
    expect(verifySvixSignature({ ...base, secret: "" })).toBe(false);
    expect(verifySvixSignature({ ...base, timestamp: "soon" })).toBe(false);
    expect(verifySvixSignature({ ...base, signature: "v1," })).toBe(false);
  });

  it("works with a secret that has no whsec_ prefix", () => {
    expect(verifySvixSignature({ ...base, secret: raw.toString("base64") })).toBe(true);
  });
});
