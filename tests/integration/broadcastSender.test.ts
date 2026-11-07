import crypto from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashBroadcast } from "@/src/lib/broadcast";
import { loadRecipients, retryFailed, sendNextChunk, startSending, type SenderDeps } from "@/src/lib/broadcastSender.server";
import { STALE_CLAIM_MS, type SendingConfig } from "@/src/lib/broadcastSending";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import type { BatchMessage, BatchResult } from "@/src/lib/mailer.server";
import { verifyUnsubscribeToken } from "@/src/lib/unsubscribeToken";

const ORG = "organizations/ghmo";
const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const serverKey = crypto.randomBytes(32);
const content = { subject: "Annual meeting", body: "Join us on Saturday." };

/** A fake provider that behaves like Resend's idempotency: a repeated key returns the first answer and sends nothing. */
function fakeProvider() {
  const delivered: { to: string; key: string; message: BatchMessage }[] = [];
  const seen = new Map<string, BatchResult>();
  let failNext = 0;
  let crashNext = 0;
  const sendBatch = async (messages: BatchMessage[], key: string): Promise<BatchResult> => {
    if (crashNext > 0) {
      // The provider accepted the emails, then the server function died before recording it.
      crashNext -= 1;
      seen.set(key, { ok: true, ids: messages.map((_, i) => `${key}-${i}`) });
      messages.forEach(message => delivered.push({ to: message.to, key, message }));
      throw new Error("function crashed");
    }
    if (seen.has(key)) return seen.get(key)!;
    if (failNext > 0) {
      failNext -= 1;
      return { ok: false, status: 500 };
    }
    const result: BatchResult = { ok: true, ids: messages.map((_, i) => `${key}-${i}`) };
    seen.set(key, result);
    messages.forEach(message => delivered.push({ to: message.to, key, message }));
    return result;
  };
  return {
    delivered,
    sendBatch,
    failTimes: (n: number) => (failNext = n),
    crashOnce: () => (crashNext = 1)
  };
}

let clock = new Date("2026-10-28T12:00:00Z");
function deps(provider: ReturnType<typeof fakeProvider>, config: Partial<SendingConfig> = {}): SenderDeps {
  return {
    db: getAdminDb(),
    config: { enabled: true, dailyLimit: 100, chunkSize: 2, maxRecipients: 1000, ...config },
    origin: "https://ghmo.example.org",
    now: () => clock,
    serverKeys: [serverKey],
    sendBatch: provider.sendBatch
  };
}

async function seedMembers(count: number) {
  const db = getAdminDb();
  const batch = db.batch();
  for (let i = 0; i < count; i += 1) {
    batch.set(db.doc(`${ORG}/members/m${i}`), { email: `m${i}@example.org`, emailLower: `m${i}@example.org`, status: "active", roles: ["member"], emailConsent: { source: "imported" } });
  }
  // Not emailable: no consent, opted out, bounced.
  batch.set(db.doc(`${ORG}/members/x1`), { emailLower: "x1@example.org", status: "active" });
  batch.set(db.doc(`${ORG}/members/x2`), { emailLower: "x2@example.org", status: "active", emailConsent: { source: "imported" }, emailOptOutAt: new Date() });
  batch.set(db.doc(`${ORG}/members/x3`), { emailLower: "x3@example.org", status: "active", emailConsent: { source: "imported" }, emailBounced: true });
  await batch.commit();
}

async function seedApproved(id = "b1") {
  await getAdminDb().doc(`${ORG}/broadcasts/${id}`).set({ ...content, status: "approved", contentHash: hashBroadcast(content), approvedHash: hashBroadcast(content), createdByUid: "alice", approvedByUid: "bob" });
  return id;
}

async function sendAll(d: SenderDeps, id: string, maxRounds = 50) {
  for (let i = 0; i < maxRounds; i += 1) {
    const outcome = await sendNextChunk(d, id);
    if (!outcome.ok || outcome.progress.done || outcome.progress.paused) return outcome;
  }
  throw new Error("did not finish");
}

beforeAll(() => {
  process.env.BROADCAST_ORG_NAME = "Test Org";
  process.env.BROADCAST_POSTAL_ADDRESS = "1 Main Street";
});

beforeEach(async () => {
  clock = new Date("2026-10-28T12:00:00Z");
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
});

describe("broadcast sender", () => {
  it("sends every consenting member exactly one personal copy, in chunks, then marks the broadcast sent", async () => {
    await seedMembers(5);
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedApproved();
    const recipients = await loadRecipients(getAdminDb());
    expect(recipients.map(r => r.id).sort()).toEqual(["m0", "m1", "m2", "m3", "m4"]);

    const started = await startSending(d, id, recipients);
    expect(started).toMatchObject({ ok: true, progress: { status: "sending", total: 5, remaining: 5 } });
    const final = await sendAll(d, id);
    expect(final).toMatchObject({ ok: true, completedNow: true, progress: { status: "sent", sent: 5, remaining: 0, done: true } });

    expect(provider.delivered.map(m => m.to).sort()).toEqual(["m0@example.org", "m1@example.org", "m2@example.org", "m3@example.org", "m4@example.org"]);
    expect(new Set(provider.delivered.map(m => m.key)).size).toBe(3); // chunks of 2, 2, 1

    const message = provider.delivered.find(m => m.to === "m3@example.org")!.message;
    expect(message.subject).toBe("Annual meeting");
    expect(message.text).toContain("Join us on Saturday.");
    expect(message.text).toContain("1 Main Street");
    const token = decodeURIComponent(/token=([^\s>]+)/.exec(message.text)![1]);
    expect(verifyUnsubscribeToken(token, [serverKey])).toBe("m3");
    expect(message.headers?.["List-Unsubscribe"]).toContain(encodeURIComponent(token));
    expect(message.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // Asking again after it is done sends nothing more.
    expect(await sendNextChunk(d, id)).toMatchObject({ ok: true, progress: { done: true } });
    expect(provider.delivered).toHaveLength(5);
  });

  it("refuses to start twice, with nobody to email, or above the recipient limit", async () => {
    await seedMembers(3);
    const provider = fakeProvider();
    const id = await seedApproved();
    expect(await startSending(deps(provider), id, [])).toMatchObject({ ok: false, status: 400 });
    expect(await startSending(deps(provider, { maxRecipients: 2 }), id, await loadRecipients(getAdminDb()))).toMatchObject({ ok: false, status: 400 });
    expect(await startSending(deps(provider), id, await loadRecipients(getAdminDb()))).toMatchObject({ ok: true });
    expect(await startSending(deps(provider), id, await loadRecipients(getAdminDb()))).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses to start or continue when the stored text no longer matches the approval", async () => {
    await seedMembers(2);
    const provider = fakeProvider();
    const id = await seedApproved();
    await getAdminDb().doc(`${ORG}/broadcasts/${id}`).update({ body: "Tampered" });
    expect(await startSending(deps(provider), id, await loadRecipients(getAdminDb()))).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });

    await getAdminDb().doc(`${ORG}/broadcasts/${id}`).update({ body: content.body });
    await startSending(deps(provider), id, await loadRecipients(getAdminDb()));
    await getAdminDb().doc(`${ORG}/broadcasts/${id}`).update({ body: "Tampered" });
    expect(await sendNextChunk(deps(provider), id)).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
    expect(provider.delivered).toHaveLength(0);
  });

  it("stops at the daily limit and resumes the next UTC day", async () => {
    await seedMembers(5);
    const provider = fakeProvider();
    const d = deps(provider, { dailyLimit: 3 });
    const id = await seedApproved();
    await startSending(d, id, await loadRecipients(getAdminDb()));

    const paused = await sendAll(d, id);
    expect(paused).toMatchObject({ ok: true, progress: { sent: 3, remaining: 2, paused: { reason: "quota", resumesAt: "2026-10-29T00:00:00.000Z" } } });
    expect(provider.delivered).toHaveLength(3);

    clock = new Date("2026-10-29T00:00:01Z");
    expect(await sendAll(d, id)).toMatchObject({ ok: true, progress: { sent: 5, done: true } });
    expect(new Set(provider.delivered.map(m => m.to)).size).toBe(5);
  });

  it("does not email anyone twice when a server function dies after the provider accepted the chunk", async () => {
    await seedMembers(4);
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedApproved();
    await startSending(d, id, await loadRecipients(getAdminDb()));

    provider.crashOnce();
    await expect(sendNextChunk(d, id)).rejects.toThrow("function crashed");
    expect(provider.delivered).toHaveLength(2);

    // Within the stale window the abandoned rows are left alone; the other rows still go out.
    await sendNextChunk(d, id);
    expect(provider.delivered).toHaveLength(4);
    expect(await sendNextChunk(d, id)).toMatchObject({ ok: true, progress: { done: false } });

    // Later, the abandoned claim is retried with the same idempotency key, so the provider sends nothing new.
    clock = new Date(clock.getTime() + STALE_CLAIM_MS);
    const final = await sendAll(d, id);
    expect(final).toMatchObject({ ok: true, progress: { sent: 4, done: true } });
    expect(provider.delivered).toHaveLength(4);
    expect(new Set(provider.delivered.map(m => m.to)).size).toBe(4);
  });

  it("never sends the same member twice when two pages send at once", async () => {
    await seedMembers(6);
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedApproved();
    await startSending(d, id, await loadRecipients(getAdminDb()));
    for (let i = 0; i < 5; i += 1) await Promise.all([sendNextChunk(d, id), sendNextChunk(d, id)]);
    expect(provider.delivered.map(m => m.to).sort()).toEqual([...new Set(provider.delivered.map(m => m.to))].sort());
    expect(provider.delivered).toHaveLength(6);
  });

  it("skips members who unsubscribed after sending started", async () => {
    await seedMembers(3);
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedApproved();
    await startSending(d, id, await loadRecipients(getAdminDb()));
    await getAdminDb().doc(`${ORG}/members/m1`).update({ emailOptOutAt: new Date() });
    expect(await sendAll(d, id)).toMatchObject({ ok: true, progress: { sent: 2, skipped: 1, done: true } });
    expect(provider.delivered.map(m => m.to)).not.toContain("m1@example.org");
  });

  it("retries a provider failure, marks failed after the last attempt, and can retry failed ones", async () => {
    await seedMembers(1);
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedApproved();
    await startSending(d, id, await loadRecipients(getAdminDb()));

    provider.failTimes(3);
    for (let i = 0; i < 2; i += 1) expect(await sendNextChunk(d, id)).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(await sendNextChunk(d, id)).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(await sendNextChunk(d, id)).toMatchObject({ ok: true, progress: { failed: 1, remaining: 0, done: true } });
    expect(provider.delivered).toHaveLength(0);

    // A failed chunk gives its quota back.
    const quota = (await getAdminDb().doc(`${ORG}/broadcastQuota/2026-10-28`).get()).data();
    expect(quota?.sent).toBe(0);

    expect(await retryFailed(d, id)).toMatchObject({ ok: true, progress: { status: "sending", failed: 0, remaining: 1 } });
    expect(await sendAll(d, id)).toMatchObject({ ok: true, progress: { sent: 1, failed: 0, done: true } });
  });

  it("does nothing while switched off, and stops once cancelled", async () => {
    await seedMembers(4);
    const provider = fakeProvider();
    const id = await seedApproved();
    await startSending(deps(provider), id, await loadRecipients(getAdminDb()));
    expect(await sendNextChunk(deps(provider, { enabled: false }), id)).toMatchObject({ ok: false, status: 409 });
    await sendNextChunk(deps(provider), id);
    await getAdminDb().doc(`${ORG}/broadcasts/${id}`).update({ status: "cancelled" });
    expect(await sendNextChunk(deps(provider), id)).toMatchObject({ ok: false, status: 409 });
    expect(provider.delivered).toHaveLength(2);
  });
});

describe("broadcast sender, one group (plan §30, 23-B)", () => {
  const cooking = { kind: "group" as const, groupId: "cooking" };
  const groupContent = { ...content, audience: cooking };

  async function seedGroupApproved(id = "g1") {
    const hash = hashBroadcast(groupContent);
    await getAdminDb()
      .doc(`${ORG}/broadcasts/${id}`)
      .set({ ...content, audience: "group", audienceGroupId: "cooking", audienceGroupName: "Cooking", status: "approved", contentHash: hash, approvedHash: hash, createdByUid: "alice", approvedByUid: "bob" });
    return id;
  }

  it("emails only the group's members who can be emailed, with the group line in the footer", async () => {
    await seedMembers(4);
    const db = getAdminDb();
    for (const id of ["m0", "m1", "x2"]) await db.doc(`${ORG}/members/${id}`).update({ groupIds: ["cooking"] });
    await db.doc(`${ORG}/members/m2`).update({ groupIds: ["callers"] });
    const provider = fakeProvider();
    const d = deps(provider);
    const id = await seedGroupApproved();

    const recipients = await loadRecipients(db, cooking);
    expect(recipients.map(r => r.id).sort()).toEqual(["m0", "m1"]);
    expect(await startSending(d, id, recipients, { audience: cooking, groupName: "Cooking team" })).toMatchObject({ ok: true, progress: { total: 2 } });
    expect((await db.doc(`${ORG}/broadcasts/${id}`).get()).get("audienceGroupName")).toBe("Cooking team");

    // m1 leaves the group after sending started: skipped, not emailed.
    await db.doc(`${ORG}/members/m1`).update({ groupIds: [] });
    expect(await sendAll(d, id)).toMatchObject({ ok: true, progress: { sent: 1, skipped: 1, done: true } });
    expect(provider.delivered.map(m => m.to)).toEqual(["m0@example.org"]);
    expect(provider.delivered[0].message.text).toContain("You got this because you are in this group: Cooking team.");
  });

  it("refuses to start for a different audience than the one stored", async () => {
    await seedMembers(2);
    const provider = fakeProvider();
    const id = await seedGroupApproved();
    expect(await startSending(deps(provider), id, [{ id: "m0" }], { audience: { kind: "all" }, groupName: null })).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
    // The stored group swapped without a new approval.
    await getAdminDb().doc(`${ORG}/broadcasts/${id}`).update({ audienceGroupId: "callers" });
    expect(await startSending(deps(provider), id, [{ id: "m0" }], { audience: { kind: "group", groupId: "callers" }, groupName: "Callers" })).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
  });

  it("an 'everyone' broadcast stored before groups existed still sends", async () => {
    await seedMembers(1);
    const provider = fakeProvider();
    const id = await seedApproved();
    expect(await startSending(deps(provider), id, await loadRecipients(getAdminDb()), { audience: { kind: "all" }, groupName: null })).toMatchObject({ ok: true });
    await sendAll(deps(provider), id);
    expect(provider.delivered[0].message.text).not.toContain("this group");
  });
});
