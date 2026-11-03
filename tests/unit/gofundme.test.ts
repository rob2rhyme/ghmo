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

describe("verifyGfmWebhookSignature with a timestamp", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.GOFUNDME_PRO_WEBHOOK_SECRET;
    process.env.GOFUNDME_PRO_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.GOFUNDME_PRO_WEBHOOK_SECRET;
    else process.env.GOFUNDME_PRO_WEBHOOK_SECRET = previous;
  });
  const signTs = (ts: string, body: string) => crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  const body = JSON.stringify({ event_id: "evt_1", type: "transaction.completed", data: { amount: 2500 } });

  it("accepts a fresh timestamped signature and refuses an old one", () => {
    const now = 1_800_000_000_000;
    const fresh = String(Math.floor(now / 1000) - 30);
    const stale = String(Math.floor(now / 1000) - 3600);
    expect(verifyGfmWebhookSignature(body, signTs(fresh, body), fresh, now)).toBe(true);
    expect(verifyGfmWebhookSignature(body, signTs(stale, body), stale, now)).toBe(false);
  });

  it("refuses a body-only signature once a timestamp header is present", () => {
    const now = 1_800_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const bodyOnly = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyGfmWebhookSignature(body, bodyOnly, ts, now)).toBe(false);
  });
});
