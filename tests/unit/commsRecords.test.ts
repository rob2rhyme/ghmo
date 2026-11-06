import { describe, expect, it, vi } from "vitest";
import {
  UNREADABLE,
  commentLoc,
  conclusionLoc,
  threadLoc,
  unpackComment,
  unpackThread,
  unpackVote,
  voteLoc,
  type Unpack
} from "@/src/lib/commsRecords";
import type { RecordLocation } from "@/src/lib/e2ee";

type State = "encrypted" | "legacy" | "failed";

/**
 * A stand-in for the provider's unpackPrivate: records with `enc` are "decrypted" from a lookup keyed by
 * location (or fail when the lookup says so); records without `enc` are legacy plaintext.
 */
function fakeUnpack(plain: Record<string, Record<string, unknown> | "fail">) {
  return vi.fn(async (raw: Record<string, unknown>, location: RecordLocation) => {
    const { enc, ...rest } = raw;
    if (enc === undefined) return { ...raw, _e2ee: "legacy" as State };
    const key = `${location.path}|${location.docId}`;
    const fields = plain[key];
    if (fields === undefined || fields === "fail") return { ...rest, _e2ee: "failed" as State, _e2eeError: "bad key" };
    return { ...rest, ...fields, _e2ee: "encrypted" as State };
  }) as unknown as Unpack & ReturnType<typeof vi.fn>;
}

const key = (loc: RecordLocation) => `${loc.path}|${loc.docId}`;

describe("record locations", () => {
  it("binds each record to its own location", () => {
    expect(threadLoc("t1")).toEqual({ path: "organizations/ghmo/commsThreads", docId: "t1" });
    expect(conclusionLoc("t1")).toEqual({ path: "organizations/ghmo/commsThreads", docId: "t1#conclusion" });
    expect(commentLoc("t1", "c1")).toEqual({ path: "organizations/ghmo/commsThreads/t1/comments", docId: "c1" });
    expect(voteLoc("t1", "u1")).toEqual({ path: "organizations/ghmo/commsThreads/t1/conclusionVotes", docId: "u1" });
  });
});

describe("unpackThread", () => {
  it("decrypts the thread and keeps public metadata", async () => {
    const unpack = fakeUnpack({ [key(threadLoc("t1"))]: { title: "Budget", body: "Details" } });
    const view = await unpackThread(unpack, "t1", { enc: "x", status: "open", approvedCount: 2, id: "forged" });
    expect(view).toEqual({ id: "t1", title: "Budget", body: "Details", status: "open", approvedCount: 2, conclusion: undefined, _e2ee: "encrypted" });
    expect(view).not.toHaveProperty("_e2eeError");
    expect(view).not.toHaveProperty("enc");
    expect(unpack).toHaveBeenCalledWith(expect.objectContaining({ enc: "x" }), threadLoc("t1"));
  });

  it("passes legacy plaintext through and defaults missing text to empty strings", async () => {
    const unpack = fakeUnpack({});
    expect(await unpackThread(unpack, "t1", { title: "Old" })).toMatchObject({ id: "t1", title: "Old", body: "", _e2ee: "legacy" });
    expect(await unpackThread(unpack, "t2", {})).toMatchObject({ id: "t2", title: "", body: "", _e2ee: "legacy" });
  });

  it("shows the unreadable text when the thread cannot be decrypted", async () => {
    const unpack = fakeUnpack({ [key(threadLoc("t1"))]: "fail" });
    const view = await unpackThread(unpack, "t1", { enc: "x", status: "closing" });
    expect(view).toMatchObject({ id: "t1", title: UNREADABLE, body: "", status: "closing", _e2ee: "failed" });
    expect(view).not.toHaveProperty("_e2eeError");
    expect(UNREADABLE).toBe("Can't be decrypted on this device");
  });

  it("decrypts an encrypted conclusion at its own location", async () => {
    const unpack = fakeUnpack({
      [key(threadLoc("t1"))]: { title: "Budget", body: "Details" },
      [key(conclusionLoc("t1"))]: { text: "Approved" }
    });
    const view = await unpackThread(unpack, "t1", { enc: "x", conclusion: { enc: "y", proposedBy: { uid: "a" } } });
    expect(view.conclusion).toEqual({ text: "Approved", proposedBy: { uid: "a" } });
    expect(view._e2ee).toBe("encrypted");
    expect(unpack).toHaveBeenCalledTimes(2);
    expect(unpack).toHaveBeenLastCalledWith({ enc: "y", proposedBy: { uid: "a" } }, conclusionLoc("t1"));
  });

  it("does not unpack a plaintext conclusion", async () => {
    const unpack = fakeUnpack({});
    const view = await unpackThread(unpack, "t1", { title: "Old", conclusion: { text: "Done" } });
    expect(view.conclusion).toEqual({ text: "Done" });
    expect(view._e2ee).toBe("legacy");
    expect(unpack).toHaveBeenCalledTimes(1);
  });

  it("marks a legacy thread with an encrypted conclusion as encrypted", async () => {
    const unpack = fakeUnpack({ [key(conclusionLoc("t1"))]: { text: "Approved" } });
    const view = await unpackThread(unpack, "t1", { title: "Old", conclusion: { enc: "y" } });
    expect(view).toMatchObject({ title: "Old", conclusion: { text: "Approved" }, _e2ee: "encrypted" });
  });

  it("merges a failed conclusion into the thread state, hiding the title too", async () => {
    const unpack = fakeUnpack({
      [key(threadLoc("t1"))]: { title: "Budget", body: "Details" },
      [key(conclusionLoc("t1"))]: "fail"
    });
    const view = await unpackThread(unpack, "t1", { enc: "x", conclusion: { enc: "y", proposedAt: 5 } });
    expect(view).toMatchObject({ title: UNREADABLE, body: "", _e2ee: "failed" });
    expect(view.conclusion).toEqual({ proposedAt: 5 });
  });

  it("keeps a failed thread failed even when the conclusion decrypts", async () => {
    const unpack = fakeUnpack({
      [key(threadLoc("t1"))]: "fail",
      [key(conclusionLoc("t1"))]: { text: "Approved" }
    });
    const view = await unpackThread(unpack, "t1", { enc: "x", conclusion: { enc: "y" } });
    expect(view).toMatchObject({ title: UNREADABLE, _e2ee: "failed", conclusion: { text: "Approved" } });
  });
});

describe("unpackComment", () => {
  it("decrypts the body at the comment's location", async () => {
    const unpack = fakeUnpack({ [key(commentLoc("t1", "c1"))]: { body: "Agreed" } });
    const view = await unpackComment(unpack, "t1", "c1", { enc: "x", likeCount: 3, parentId: "c0" });
    expect(view).toEqual({ id: "c1", body: "Agreed", likeCount: 3, parentId: "c0", _e2ee: "encrypted" });
    expect(unpack).toHaveBeenCalledWith(expect.anything(), commentLoc("t1", "c1"));
  });

  it("passes legacy comments through, with an empty body when missing", async () => {
    const unpack = fakeUnpack({});
    expect(await unpackComment(unpack, "t1", "c1", { body: "Old" })).toMatchObject({ id: "c1", body: "Old", _e2ee: "legacy" });
    expect(await unpackComment(unpack, "t1", "c2", {})).toMatchObject({ id: "c2", body: "", _e2ee: "legacy" });
  });

  it("shows the unreadable text when decryption fails", async () => {
    const unpack = fakeUnpack({ [key(commentLoc("t1", "c1"))]: "fail" });
    const view = await unpackComment(unpack, "t1", "c1", { enc: "x" });
    expect(view).toEqual({ id: "c1", body: UNREADABLE, _e2ee: "failed" });
  });
});

describe("unpackVote", () => {
  it("returns approve or reject", async () => {
    const unpack = fakeUnpack({
      [key(voteLoc("t1", "u1"))]: { value: "approve" },
      [key(voteLoc("t1", "u2"))]: { value: "reject" }
    });
    expect(await unpackVote(unpack, "t1", "u1", { enc: "x" })).toBe("approve");
    expect(await unpackVote(unpack, "t1", "u2", { enc: "x" })).toBe("reject");
    expect(unpack).toHaveBeenCalledWith(expect.anything(), voteLoc("t1", "u1"));
  });

  it("reads legacy plaintext votes", async () => {
    expect(await unpackVote(fakeUnpack({}), "t1", "u1", { value: "reject" })).toBe("reject");
  });

  it("is null for a failed decrypt", async () => {
    const unpack = fakeUnpack({ [key(voteLoc("t1", "u1"))]: "fail" });
    expect(await unpackVote(unpack, "t1", "u1", { enc: "x", value: "approve" })).toBeNull();
  });

  it("is null for missing or unknown values", async () => {
    const unpack = fakeUnpack({});
    expect(await unpackVote(unpack, "t1", "u1", {})).toBeNull();
    expect(await unpackVote(unpack, "t1", "u1", { value: "abstain" })).toBeNull();
    expect(await unpackVote(unpack, "t1", "u1", { value: "APPROVE" })).toBeNull();
  });
});
