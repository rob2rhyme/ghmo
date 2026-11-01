import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  SUBJECT_MAX,
  hashBroadcast,
  normalizeBroadcastContent,
  planBroadcastTransition,
  planContentEdit,
  selectRecipients
} from "@/src/lib/broadcast";

const now = new Date("2026-10-28T10:00:00Z");
const content = { subject: "Annual meeting", body: "Join us on Saturday." };
const hash = hashBroadcast(content);
const draft = { status: "draft" as const, ...content, createdByUid: "alice" };
const pending = { ...draft, status: "pending_approval" as const, submittedByUid: "alice", submittedHash: hash };

describe("normalizeBroadcastContent", () => {
  it("trims, collapses subject whitespace and normalizes line endings", () => {
    expect(normalizeBroadcastContent({ subject: "  Hello \n  world ", body: "Line 1\r\nLine 2\r\n" })).toEqual({
      ok: true,
      content: { subject: "Hello world", body: "Line 1\nLine 2" }
    });
  });

  it("refuses empty or oversized content and non-strings", () => {
    expect(normalizeBroadcastContent({ subject: "", body: "x" }).ok).toBe(false);
    expect(normalizeBroadcastContent({ subject: "x", body: "  " }).ok).toBe(false);
    expect(normalizeBroadcastContent({ subject: "x".repeat(SUBJECT_MAX + 1), body: "x" }).ok).toBe(false);
    expect(normalizeBroadcastContent({ subject: "x", body: "x".repeat(BODY_MAX + 1) }).ok).toBe(false);
    expect(normalizeBroadcastContent({ subject: 5, body: null }).ok).toBe(false);
    expect(normalizeBroadcastContent({ subject: "x".repeat(SUBJECT_MAX), body: "x".repeat(BODY_MAX) }).ok).toBe(true);
  });
});

describe("hashBroadcast", () => {
  it("changes with the subject or the body and is stable otherwise", () => {
    expect(hashBroadcast(content)).toBe(hashBroadcast({ ...content }));
    expect(hashBroadcast(content)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBroadcast({ ...content, subject: "Annual meeting!" })).not.toBe(hash);
    expect(hashBroadcast({ ...content, body: "Join us on Sunday." })).not.toBe(hash);
  });

  it("does not confuse where the subject ends and the body starts", () => {
    expect(hashBroadcast({ subject: "ab", body: "c" })).not.toBe(hashBroadcast({ subject: "a", body: "bc" }));
  });
});

describe("selectRecipients", () => {
  it("keeps only active, consented, not opted-out, not bounced members", () => {
    const ok = { status: "active", emailLower: "a@x.org", emailConsent: { source: "imported" } };
    const members = [
      ok,
      { ...ok, emailLower: "b@x.org", emailOptOutAt: new Date() },
      { ...ok, emailLower: "c@x.org", emailBounced: true },
      { ...ok, emailLower: "d@x.org", emailConsent: undefined },
      { ...ok, emailLower: "e@x.org", status: "disabled" }
    ];
    expect(selectRecipients(members)).toEqual([ok]);
  });
});

describe("planContentEdit", () => {
  it("keeps a draft a draft and updates the fingerprint", () => {
    const plan = planContentEdit(draft, { subject: "New", body: "Text" }, now);
    expect(plan).toMatchObject({ ok: true, audit: "broadcast_updated", updates: { subject: "New", contentHash: hashBroadcast({ subject: "New", body: "Text" }) } });
    expect(plan.ok && "status" in plan.updates).toBe(false);
  });

  it("sends a submitted or approved broadcast back to draft and clears the approval", () => {
    for (const status of ["pending_approval", "approved"] as const) {
      const plan = planContentEdit({ ...pending, status }, { subject: "New", body: "Text" }, now);
      expect(plan).toMatchObject({
        ok: true,
        audit: "broadcast_edited_returned_to_draft",
        updates: { status: "draft", submittedByUid: null, submittedHash: null, approvedByUid: null, approvedHash: null }
      });
    }
  });

  it("refuses to edit a cancelled broadcast", () => {
    expect(planContentEdit({ ...draft, status: "cancelled" }, content, now)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("planBroadcastTransition", () => {
  it("submits a draft, recording who and the fingerprint", () => {
    expect(planBroadcastTransition({ before: draft, action: "submit", actorUid: "alice", now })).toMatchObject({
      ok: true,
      audit: "broadcast_submitted",
      updates: { status: "pending_approval", submittedByUid: "alice", submittedHash: hash }
    });
  });

  it("refuses to submit anything but a draft, or a draft with empty content", () => {
    expect(planBroadcastTransition({ before: pending, action: "submit", actorUid: "alice", now })).toMatchObject({ ok: false, status: 400 });
    expect(planBroadcastTransition({ before: { ...draft, body: "" }, action: "submit", actorUid: "alice", now })).toMatchObject({ ok: false, status: 400 });
  });

  it("lets a different admin approve with the matching hash", () => {
    expect(planBroadcastTransition({ before: pending, action: "approve", actorUid: "bob", now, contentHash: hash })).toMatchObject({
      ok: true,
      audit: "broadcast_approved",
      updates: { status: "approved", approvedByUid: "bob", approvedHash: hash }
    });
  });

  it("never lets the writer or the submitter approve", () => {
    expect(planBroadcastTransition({ before: pending, action: "approve", actorUid: "alice", now, contentHash: hash })).toMatchObject({
      ok: false,
      status: 403,
      code: "SEPARATION_OF_DUTIES"
    });
    // Alice wrote it, Bob submitted it: neither may approve.
    const bobSubmitted = { ...pending, submittedByUid: "bob" };
    expect(planBroadcastTransition({ before: bobSubmitted, action: "approve", actorUid: "alice", now, contentHash: hash })).toMatchObject({ ok: false, code: "SEPARATION_OF_DUTIES" });
    expect(planBroadcastTransition({ before: bobSubmitted, action: "approve", actorUid: "bob", now, contentHash: hash })).toMatchObject({ ok: false, code: "SEPARATION_OF_DUTIES" });
  });

  it("refuses an approval for text the approver did not see", () => {
    for (const contentHash of [undefined, "0".repeat(64), hashBroadcast({ ...content, body: "Different" })]) {
      expect(planBroadcastTransition({ before: pending, action: "approve", actorUid: "bob", now, contentHash })).toMatchObject({ ok: false, status: 409, code: "CONTENT_CHANGED" });
    }
    // Stored content drifted from what was submitted (should not happen, but approval must still fail).
    const drifted = { ...pending, body: "Edited behind the scenes" };
    expect(planBroadcastTransition({ before: drifted, action: "approve", actorUid: "bob", now, contentHash: hashBroadcast({ ...content, body: drifted.body }) })).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
  });

  it("only approves what is waiting for approval", () => {
    expect(planBroadcastTransition({ before: draft, action: "approve", actorUid: "bob", now, contentHash: hash })).toMatchObject({ ok: false, status: 400 });
    expect(planBroadcastTransition({ before: { ...pending, status: "approved" }, action: "approve", actorUid: "bob", now, contentHash: hash })).toMatchObject({ ok: false, status: 400 });
  });

  it("withdraws pending or approved broadcasts to draft and clears the approval", () => {
    for (const status of ["pending_approval", "approved"] as const) {
      expect(planBroadcastTransition({ before: { ...pending, status }, action: "withdraw", actorUid: "bob", now })).toMatchObject({
        ok: true,
        updates: { status: "draft", approvedByUid: null, submittedByUid: null }
      });
    }
    expect(planBroadcastTransition({ before: draft, action: "withdraw", actorUid: "alice", now })).toMatchObject({ ok: false });
  });

  it("cancels from any live status, once", () => {
    for (const before of [draft, pending, { ...pending, status: "approved" as const }]) {
      expect(planBroadcastTransition({ before, action: "cancel", actorUid: "bob", now })).toMatchObject({ ok: true, updates: { status: "cancelled", cancelledByUid: "bob" } });
    }
    expect(planBroadcastTransition({ before: { ...draft, status: "cancelled" }, action: "cancel", actorUid: "bob", now })).toMatchObject({ ok: false });
  });
});

describe("posting by hand to the Messenger group chats (plan §12, 9-D)", () => {
  it("formats the approved text for a chat: subject, blank line, message, no footer", async () => {
    const { messengerText } = await import("@/src/lib/broadcast");
    expect(messengerText({ subject: "General meeting", body: "Saturday 5 pm.\nAgenda: budget." })).toBe("General meeting\n\nSaturday 5 pm.\nAgenda: budget.");
  });

  it("records a post only for approved, unchanged text, and only to a known chat", async () => {
    const { planManualPost } = await import("@/src/lib/broadcast");
    const now = new Date("2026-11-01T12:00:00Z");
    const approved = { status: "approved" as const, ...content, approvedHash: hash };
    const ok = planManualPost({ before: approved, channel: "messenger_bod", contentHash: hash, actorUid: "a", actorName: "Alice", now });
    expect(ok).toEqual({ ok: true, post: { channel: "messenger_bod", at: now, byUid: "a", byName: "Alice" } });
    for (const status of ["sending", "sent"] as const) {
      expect(planManualPost({ before: { ...approved, status }, channel: "messenger_community", contentHash: hash, actorUid: "a", actorName: "A", now }).ok).toBe(true);
    }
    for (const status of ["draft", "pending_approval", "cancelled"] as const) {
      expect(planManualPost({ before: { ...approved, status }, channel: "messenger_bod", contentHash: hash, actorUid: "a", actorName: "A", now })).toMatchObject({ ok: false, status: 400 });
    }
    expect(planManualPost({ before: approved, channel: "whatsapp" as never, contentHash: hash, actorUid: "a", actorName: "A", now })).toMatchObject({ ok: false, status: 400 });
    // The copied text is stale, or the stored text no longer matches what was approved.
    expect(planManualPost({ before: approved, channel: "messenger_bod", contentHash: "0".repeat(64), actorUid: "a", actorName: "A", now })).toMatchObject({ ok: false, status: 409, code: "CONTENT_CHANGED" });
    expect(planManualPost({ before: { ...approved, body: "Changed" }, channel: "messenger_bod", contentHash: hash, actorUid: "a", actorName: "A", now })).toMatchObject({ ok: false, status: 409 });
    expect(planManualPost({ before: { ...approved, approvedHash: null }, channel: "messenger_bod", contentHash: hash, actorUid: "a", actorName: "A", now })).toMatchObject({ ok: false, status: 409 });
  });
});
