import { describe, expect, it } from "vitest";
import { canonicalJson, hashContent, normalizeContent } from "@/src/lib/minutesContent";
import { planTransition, type WorkflowInput } from "@/src/lib/minutesWorkflow";

const DEL = Symbol("delete");
const now = new Date("2026-01-01T00:00:00Z");
const content = { agenda: ["Hall"], decisions: ["Buy the hall"], discussionSummary: "Talked", actionItems: [{ task: "Call bank", dueDate: "2026-02-01" }] };

const base = (over: Partial<WorkflowInput>): WorkflowInput => ({
  before: { status: "draft", ...content },
  editsContent: false,
  actorUid: "alice",
  now,
  deleteField: DEL,
  ...over
});

describe("canonical content", () => {
  it("is independent of key order, whitespace and empty fields", async () => {
    const a = await hashContent({ decisions: [" Buy "], agenda: [], chairedBy: "  " });
    const b = await hashContent({ chairedBy: undefined, agenda: [""], decisions: ["Buy"] });
    expect(a).toBe(b);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it("changes when any word changes", async () => {
    expect(await hashContent({ decisions: ["Buy the hall"] })).not.toBe(await hashContent({ decisions: ["Buy the hill"] }));
  });

  it("reads dates from strings and Firestore timestamps alike", () => {
    const ms = Date.parse("2026-02-01");
    expect(normalizeContent({ actionItems: [{ task: "x", dueDate: "2026-02-01" }] }).actionItems[0].dueDate).toBe(ms);
    expect(normalizeContent({ actionItems: [{ task: "x", dueDate: { toMillis: () => ms } }] }).actionItems[0].dueDate).toBe(ms);
  });
});

describe("minutes workflow", () => {
  const encrypted = { status: "submitted", enc: {}, submittedByUid: "alice", submittedHash: "" };

  it("submits with a hash and records who submitted", async () => {
    const hash = "a".repeat(64);
    const r = await planTransition(base({ action: "submit", before: { status: "draft", enc: {} }, contentHash: hash }));
    expect(r).toMatchObject({ ok: true, updates: { status: "submitted", submittedByUid: "alice", submittedHash: hash } });
  });

  it("needs a content hash to submit encrypted minutes, and computes it itself for plaintext ones", async () => {
    expect(await planTransition(base({ action: "submit", before: { status: "draft", enc: {} } }))).toMatchObject({ ok: false, code: "CONTENT_HASH_REQUIRED" });
    const r = await planTransition(base({ action: "submit" }));
    expect(r).toMatchObject({ ok: true, updates: { submittedHash: await hashContent(content) } });
  });

  it("refuses approval by the person who submitted", async () => {
    const hash = await hashContent(content);
    const r = await planTransition(base({ action: "approve", actorUid: "alice", before: { ...encrypted, submittedHash: hash }, published: content }));
    expect(r).toMatchObject({ ok: false, status: 403, code: "SEPARATION_OF_DUTIES" });
  });

  it("refuses approval when the published content differs from what was submitted", async () => {
    const hash = await hashContent(content);
    const r = await planTransition(
      base({ action: "approve", actorUid: "bob", before: { ...encrypted, submittedHash: hash }, published: { ...content, decisions: ["Sell the hall"] } })
    );
    expect(r).toMatchObject({ ok: false, status: 409, code: "CONTENT_CHANGED" });
  });

  it("approves matching content, publishes it and snapshots a new version", async () => {
    const hash = await hashContent(content);
    const r = await planTransition(
      base({ action: "approve", actorUid: "bob", before: { ...encrypted, submittedHash: hash, version: 2 }, published: { ...content, extra: "ignored" } })
    );
    expect(r).toMatchObject({
      ok: true,
      audit: "minutes_approved",
      updates: { status: "approved", approvedByUid: "bob", version: 3, contentHash: hash },
      version: { version: 3, contentHash: hash, approvedByUid: "bob", submittedByUid: "alice" }
    });
    if (r.ok) expect(r.updates.published).toEqual(normalizeContent(content));
  });

  it("returns edited submitted minutes to draft, and refuses edits to approved ones", async () => {
    const edit = await planTransition(base({ before: { status: "submitted", submittedByUid: "alice", submittedHash: "x" }, editsContent: true }));
    expect(edit).toMatchObject({ ok: true, updates: { status: "draft", submittedByUid: null, submittedHash: DEL } });
    expect(await planTransition(base({ before: { status: "approved" }, editsContent: true }))).toMatchObject({ ok: false, status: 403 });
  });

  it("reopening approved minutes needs a real reason and is audited; other returns do not", async () => {
    const approved = { status: "approved", published: {}, enc: {} };
    expect(await planTransition(base({ action: "returnToDraft", before: approved }))).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(await planTransition(base({ action: "returnToDraft", before: approved, reason: "too short" }))).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    const ok = await planTransition(base({ action: "returnToDraft", before: approved, reason: "Typo in the vote count" }));
    expect(ok).toMatchObject({ ok: true, audit: "minutes_reopened", updates: { status: "draft", published: DEL, reopenReason: "Typo in the vote count" } });
    expect(await planTransition(base({ action: "returnToDraft", before: { status: "submitted" } }))).toMatchObject({ ok: true, audit: "minutes_returned_to_draft" });
  });

  it("won't mix a content edit with a status change", async () => {
    expect(await planTransition(base({ action: "submit", editsContent: true }))).toMatchObject({ ok: false, status: 400 });
  });
});
