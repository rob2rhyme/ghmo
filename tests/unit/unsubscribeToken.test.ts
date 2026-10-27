import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/src/lib/unsubscribeToken";

const key = crypto.randomBytes(32);
const otherKey = crypto.randomBytes(32);

describe("unsubscribe tokens", () => {
  it("round-trips a member id", () => {
    const token = signUnsubscribeToken("member_1-A", [key]);
    expect(verifyUnsubscribeToken(token, [key])).toBe("member_1-A");
  });

  it("is deterministic, so a resend gives the same link", () => {
    expect(signUnsubscribeToken("m1", [key])).toBe(signUnsubscribeToken("m1", [key]));
  });

  it("refuses a token for a different member, a tampered signature, or another key", () => {
    const token = signUnsubscribeToken("m1", [key]);
    const sig = token.slice(token.lastIndexOf(".") + 1);
    expect(verifyUnsubscribeToken(`m2.${sig}`, [key])).toBeNull();
    expect(verifyUnsubscribeToken(`m1.${sig.slice(0, -2)}AA`, [key])).toBeNull();
    expect(verifyUnsubscribeToken(token, [otherKey])).toBeNull();
  });

  it("still accepts tokens made with a previous key after rotation", () => {
    const old = signUnsubscribeToken("m1", [otherKey]);
    expect(verifyUnsubscribeToken(old, [key, otherKey])).toBe("m1");
    expect(signUnsubscribeToken("m1", [key, otherKey])).toBe(signUnsubscribeToken("m1", [key]));
  });

  it("is not the same signature the same key would give another purpose", () => {
    const direct = crypto.createHmac("sha256", key).update("unsubscribe:v1:m1").digest("base64url");
    expect(signUnsubscribeToken("m1", [key]).endsWith(direct)).toBe(false);
  });

  it("rejects junk without throwing", () => {
    for (const junk of [undefined, null, 5, "", ".", "nodot", ".sig", "a/b.sig", "m1.", `m1.${"x".repeat(400)}`, "m 1.sig"]) {
      expect(verifyUnsubscribeToken(junk, [key])).toBeNull();
    }
    expect(verifyUnsubscribeToken("m1.abc", [])).toBeNull();
  });

  it("will not sign an unsafe member id or sign with no key", () => {
    expect(() => signUnsubscribeToken("a/b", [key])).toThrow();
    expect(() => signUnsubscribeToken("", [key])).toThrow();
    expect(() => signUnsubscribeToken("m1", [])).toThrow();
  });
});
