import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyGfmWebhookSignature } from "@/src/lib/gofundme";

const SECRET = "webhook-secret-for-tests";

describe("verifyGfmWebhookSignature", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.GOFUNDME_PRO_WEBHOOK_SECRET;
    process.env.GOFUNDME_PRO_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.GOFUNDME_PRO_WEBHOOK_SECRET;
    else process.env.GOFUNDME_PRO_WEBHOOK_SECRET = previous;
  });

  const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");

  it("accepts a correct HMAC", () => {
    const body = JSON.stringify({ type: "transaction.created" });
    expect(verifyGfmWebhookSignature(body, sign(body))).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ amount: 5 });
    expect(verifyGfmWebhookSignature(JSON.stringify({ amount: 5000 }), sign(body))).toBe(false);
  });

  it("rejects missing signatures", () => {
    expect(verifyGfmWebhookSignature("{}", undefined)).toBe(false);
  });
});
