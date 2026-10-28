import { afterEach, describe, expect, it, vi } from "vitest";
import { hashBroadcast, planBroadcastTransition, planContentEdit, planStartSending } from "@/src/lib/broadcast";
import {
  MAX_ATTEMPTS,
  STALE_CLAIM_MS,
  idempotencyKey,
  isStaleClaim,
  nextChunkSize,
  nextQuotaReset,
  quotaDay,
  sendingConfigFromEnv
} from "@/src/lib/broadcastSending";
import { sendMailBatch } from "@/src/lib/mailer.server";

const now = new Date("2026-10-28T23:30:00Z");
const content = { subject: "Hello", body: "Text" };
const approved = { status: "approved" as const, ...content, createdByUid: "a", approvedHash: hashBroadcast(content) };

describe("sending configuration", () => {
  it("is off unless FEATURE_BROADCASTS=true, with safe defaults", () => {
    expect(sendingConfigFromEnv({})).toEqual({ enabled: false, dailyLimit: 100, chunkSize: 50, maxRecipients: 1000 });
    expect(sendingConfigFromEnv({ FEATURE_BROADCASTS: "TRUE" }).enabled).toBe(false);
    expect(sendingConfigFromEnv({ FEATURE_BROADCASTS: "true" }).enabled).toBe(true);
  });

  it("clamps numbers to sensible ranges and ignores junk", () => {
    const config = sendingConfigFromEnv({ BROADCAST_DAILY_LIMIT: "250", BROADCAST_CHUNK_SIZE: "500", BROADCAST_MAX_RECIPIENTS: "abc" });
    expect(config).toMatchObject({ dailyLimit: 250, chunkSize: 100, maxRecipients: 1000 });
    expect(sendingConfigFromEnv({ BROADCAST_CHUNK_SIZE: "0", BROADCAST_DAILY_LIMIT: "-5" })).toMatchObject({ chunkSize: 1, dailyLimit: 0 });
  });
});

describe("quota arithmetic", () => {
  it("uses the UTC day and resets at the next UTC midnight", () => {
    expect(quotaDay(now)).toBe("2026-10-28");
    expect(nextQuotaReset(now).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(nextQuotaReset(new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("never claims more than the chunk, the remaining quota, or what is pending", () => {
    expect(nextChunkSize({ chunkSize: 50, dailyLimit: 100, sentToday: 0, pending: 500 })).toBe(50);
    expect(nextChunkSize({ chunkSize: 50, dailyLimit: 100, sentToday: 80, pending: 500 })).toBe(20);
    expect(nextChunkSize({ chunkSize: 50, dailyLimit: 100, sentToday: 100, pending: 500 })).toBe(0);
    expect(nextChunkSize({ chunkSize: 50, dailyLimit: 100, sentToday: 120, pending: 500 })).toBe(0);
    expect(nextChunkSize({ chunkSize: 50, dailyLimit: 100, sentToday: 0, pending: 3 })).toBe(3);
  });
});

describe("claims", () => {
  it("treats missing or old claims as abandoned", () => {
    expect(isStaleClaim(null, now)).toBe(true);
    expect(isStaleClaim(new Date(now.getTime() - STALE_CLAIM_MS), now)).toBe(true);
    expect(isStaleClaim(new Date(now.getTime() - STALE_CLAIM_MS + 1), now)).toBe(false);
  });

  it("derives one stable idempotency key per claim", () => {
    expect(idempotencyKey("b1", "c1")).toBe(idempotencyKey("b1", "c1"));
    expect(idempotencyKey("b1", "c1")).not.toBe(idempotencyKey("b1", "c2"));
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
  });
});

describe("starting and stopping", () => {
  it("starts only an approved broadcast whose text still matches the approval", () => {
    expect(planStartSending(approved, "b", now)).toMatchObject({ ok: true, updates: { status: "sending", startedByUid: "b" } });
    expect(planStartSending({ ...approved, status: "pending_approval" }, "b", now)).toMatchObject({ ok: false, status: 400 });
    expect(planStartSending({ ...approved, body: "Changed" }, "b", now)).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
    expect(planStartSending({ ...approved, approvedHash: null }, "b", now)).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
  });

  it("lets a broadcast be cancelled while sending, but not after it was sent", () => {
    expect(planBroadcastTransition({ before: { ...approved, status: "sending" }, action: "cancel", actorUid: "b", now })).toMatchObject({ ok: true });
    expect(planBroadcastTransition({ before: { ...approved, status: "sent" }, action: "cancel", actorUid: "b", now })).toMatchObject({ ok: false });
  });

  it("refuses edits and withdrawal once sending has started", () => {
    for (const status of ["sending", "sent"] as const) {
      expect(planContentEdit({ ...approved, status }, content, now)).toMatchObject({ ok: false, status: 409 });
      expect(planBroadcastTransition({ before: { ...approved, status }, action: "withdraw", actorUid: "b", now })).toMatchObject({ ok: false });
    }
  });
});

describe("sendMailBatch", () => {
  afterEach(() => vi.unstubAllEnvs());
  const message = { to: "a@x.org", subject: "s", text: "t", headers: { "List-Unsubscribe": "<https://x.org/u>" } };

  it("does nothing unless configured, or for an empty or oversized batch", async () => {
    const spy = vi.fn();
    expect(await sendMailBatch([message], "k", spy as unknown as typeof fetch)).toEqual({ ok: false });
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "GHMO <no-reply@x.org>");
    expect(await sendMailBatch([], "k", spy as unknown as typeof fetch)).toEqual({ ok: false });
    expect(await sendMailBatch(Array(101).fill(message), "k", spy as unknown as typeof fetch)).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts one batch with the idempotency key, one recipient per message, and returns the ids", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "GHMO <no-reply@x.org>");
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "e1" }, { id: "e2" }] }) });
    const result = await sendMailBatch([message, { ...message, to: "b@x.org" }], "key-1", ok as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, ids: ["e1", "e2"] });
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(init.headers["Idempotency-Key"]).toBe("key-1");
    const body = JSON.parse(init.body);
    expect(body.map((m: { to: string[] }) => m.to)).toEqual([["a@x.org"], ["b@x.org"]]);
    expect(body[0]).toMatchObject({ from: "GHMO <no-reply@x.org>", headers: message.headers });
  });

  it("reports provider errors and network failures without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "GHMO <no-reply@x.org>");
    const refused = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    expect(await sendMailBatch([message], "k", refused as unknown as typeof fetch)).toEqual({ ok: false, status: 429 });
    const boom = vi.fn().mockRejectedValue(new Error("network"));
    expect(await sendMailBatch([message], "k", boom as unknown as typeof fetch)).toEqual({ ok: false });
  });
});
