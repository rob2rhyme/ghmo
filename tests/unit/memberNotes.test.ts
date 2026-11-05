import { describe, expect, it } from "vitest";
import { MAX_NOTES_PER_MEMBER, NOTE_MAX, canDeleteNote, checkNoteText, cleanNoteText, memberNoteLoc, sortNotesNewestFirst } from "@/src/lib/memberNotes";

describe("note text", () => {
  it("trims and normalizes line breaks", () => {
    expect(cleanNoteText("  Called\r\nabout the hall  ")).toBe("Called\nabout the hall");
    expect(cleanNoteText(7)).toBe("");
  });

  it("refuses an empty note and one that is too long, saying how long it is", () => {
    expect(checkNoteText("   ")).toBe("Write something to save.");
    expect(checkNoteText("Fine")).toBeNull();
    expect(checkNoteText("x".repeat(NOTE_MAX))).toBeNull();
    expect(checkNoteText("x".repeat(NOTE_MAX + 1))).toBe(`A note can be at most ${NOTE_MAX} characters. This one is ${NOTE_MAX + 1}.`);
  });

  it("allows 200 notes per member", () => {
    expect(MAX_NOTES_PER_MEMBER).toBe(200);
  });
});

describe("where a note is bound", () => {
  it("is bound to its member and its own id, so it can't be moved", () => {
    expect(memberNoteLoc("m1", "n1")).toEqual({ path: "organizations/ghmo/members", docId: "m1/notes/n1" });
    expect(memberNoteLoc("m1", "n1")).not.toEqual(memberNoteLoc("m2", "n1"));
    expect(memberNoteLoc("m1", "n1")).not.toEqual(memberNoteLoc("m1", "n2"));
  });
});

describe("who may delete", () => {
  it("is the author or a super admin", () => {
    const note = { authorUid: "alice" };
    expect(canDeleteNote(note, { uid: "alice", superAdmin: false })).toBe(true);
    expect(canDeleteNote(note, { uid: "bob", superAdmin: false })).toBe(false);
    expect(canDeleteNote(note, { uid: "bob", superAdmin: true })).toBe(true);
  });
});

describe("order", () => {
  it("lists the newest first, notes without a time last, and breaks ties by id", () => {
    const sorted = sortNotesNewestFirst([
      { id: "b", createdAt: 100 },
      { id: "z", createdAt: null },
      { id: "a", createdAt: 300 },
      { id: "c", createdAt: 100 }
    ]);
    expect(sorted.map(n => n.id)).toEqual(["a", "b", "c", "z"]);
  });
});
