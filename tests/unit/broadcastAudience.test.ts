import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  audienceFields,
  audienceKey,
  audienceLabel,
  hashBroadcast,
  inAudience,
  normalizeBroadcastContent,
  planBroadcastTransition,
  planContentEdit,
  planStartSending,
  readAudience,
  selectRecipients
} from "@/src/lib/broadcast";
import { groupFooterLine, withUnsubscribeFooter } from "@/src/lib/broadcastMail";

// Plan §30, 23-B: a broadcast can go to one group (D91); the audience is part of the approval (D92).
const now = new Date("2026-11-07T10:00:00Z");
const content = { subject: "Cooking shifts", body: "Please sign up for Saturday." };
const cooking = { kind: "group" as const, groupId: "cooking" };

describe("the audience in the approval hash", () => {
  it("hashes 'everyone' exactly as before groups existed, so older approvals still match", () => {
    const before = crypto.createHash("sha256").update(JSON.stringify({ v: 1, audience: "all", subject: content.subject, body: content.body })).digest("hex");
    expect(hashBroadcast(content)).toBe(before);
    expect(hashBroadcast({ ...content, audience: { kind: "all" } })).toBe(before);
  });

  it("changes when the audience changes", () => {
    const all = hashBroadcast(content);
    const group = hashBroadcast({ ...content, audience: cooking });
    expect(group).not.toBe(all);
    expect(hashBroadcast({ ...content, audience: { kind: "group", groupId: "callers" } })).not.toBe(group);
    expect(audienceKey(cooking)).toBe("group:cooking");
    expect(audienceKey(undefined)).toBe("all");
  });
});

describe("reading the audience", () => {
  it("treats missing or 'all' as everyone and needs a group id for a group", () => {
    expect(readAudience({})).toEqual({ kind: "all" });
    expect(readAudience({ audience: "all", audienceGroupId: "cooking" })).toEqual({ kind: "all" });
    expect(readAudience({ audience: "group", audienceGroupId: "cooking" })).toEqual(cooking);
    expect(readAudience({ audience: "group" })).toBeNull();
    expect(readAudience({ audience: "group", audienceGroupId: "../members" })).toBeNull();
    expect(readAudience({ audience: "everyone" })).toBeNull();
  });

  it("is checked with the content, and the stored fields round-trip", () => {
    expect(normalizeBroadcastContent({ ...content, ...audienceFields(cooking) })).toEqual({ ok: true, content: { ...content, audience: cooking } });
    expect(normalizeBroadcastContent({ ...content, audience: "group" })).toMatchObject({ ok: false });
    expect(audienceFields({ kind: "all" })).toEqual({ audience: "all", audienceGroupId: null });
    expect(audienceLabel({ kind: "all" })).toBe("Everyone who agreed to email");
    expect(audienceLabel(cooking, "Cooking team")).toBe("Cooking team");
    expect(audienceLabel(cooking, null)).toBe("A group that no longer exists");
  });
});

describe("choosing recipients for a group", () => {
  const ready = { status: "active", emailLower: "a@x.org", emailConsent: { source: "imported" } };
  it("keeps only members of the group who can be emailed", () => {
    const inGroup = { ...ready, emailLower: "in@x.org", groupIds: ["cooking", "callers"] };
    const optedOut = { ...inGroup, emailLower: "out@x.org", emailOptOutAt: new Date() };
    const other = { ...ready, emailLower: "other@x.org", groupIds: ["callers"] };
    const none = { ...ready, emailLower: "none@x.org" };
    expect(selectRecipients([inGroup, optedOut, other, none], cooking)).toEqual([inGroup]);
    expect(selectRecipients([inGroup, optedOut, other, none])).toEqual([inGroup, other, none]);
    expect(inAudience({ groupIds: "cooking" }, cooking)).toBe(false);
    expect(inAudience({}, { kind: "all" })).toBe(true);
  });
});

describe("changing the audience", () => {
  const groupHash = hashBroadcast({ ...content, audience: cooking });
  const approved = { status: "approved" as const, ...content, ...audienceFields(cooking), createdByUid: "alice", submittedByUid: "alice", submittedHash: groupHash, approvedHash: groupHash };

  it("sends an approved broadcast back to draft when the group changes", () => {
    const plan = planContentEdit(approved, { ...content, audience: { kind: "group", groupId: "callers" } }, now);
    expect(plan).toMatchObject({
      ok: true,
      audit: "broadcast_edited_returned_to_draft",
      updates: { status: "draft", audience: "group", audienceGroupId: "callers", approvedHash: null, contentHash: hashBroadcast({ ...content, audience: { kind: "group", groupId: "callers" } }) }
    });
  });

  it("widening to everyone also needs approval again", () => {
    const plan = planContentEdit(approved, { ...content, audience: { kind: "all" } }, now);
    expect(plan).toMatchObject({ ok: true, updates: { status: "draft", audience: "all", audienceGroupId: null } });
  });

  it("approval and sending are bound to the stored group", () => {
    const pending = { ...approved, status: "pending_approval" as const, approvedHash: null };
    expect(planBroadcastTransition({ before: pending, action: "approve", actorUid: "bob", now, contentHash: groupHash })).toMatchObject({ ok: true });
    // An approver who saw the "everyone" version can't approve the group version, and the other way round.
    expect(planBroadcastTransition({ before: pending, action: "approve", actorUid: "bob", now, contentHash: hashBroadcast(content) })).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
    expect(planStartSending(approved, "bob", now)).toMatchObject({ ok: true });
    // The group was swapped in storage without a new approval: refused.
    expect(planStartSending({ ...approved, audienceGroupId: "callers" }, "bob", now)).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
    expect(planStartSending({ ...approved, audience: "all", audienceGroupId: null }, "bob", now)).toMatchObject({ ok: false, code: "CONTENT_CHANGED" });
  });
});

describe("the footer of a group email", () => {
  const footer = { orgName: "GHMO", postalAddress: "1 Main St, Harrisburg PA" };
  it("says which group the person is in, and keeps the one unsubscribe link", () => {
    const text = withUnsubscribeFooter("Hello", { origin: "https://ghmo.org", token: "t", footer, groupName: "Cooking team" });
    expect(text).toContain(groupFooterLine("Cooking team"));
    expect(groupFooterLine("Cooking team")).toBe("You got this because you are in this group: Cooking team.");
    expect(text).toContain("https://ghmo.org/unsubscribe?token=t");
    expect(withUnsubscribeFooter("Hello", { origin: "https://ghmo.org", token: "t", footer })).not.toContain("this group");
  });
});
