import { describe, expect, it } from "vitest";
import { toArchiveEntry } from "@/src/lib/minutesArchive";

const approved = {
  id: "m1",
  status: "approved",
  eventTitle: "Board",
  eventDate: 1_700_000_000_000,
  meetingType: "Board",
  recordedBy: "Alice",
  submittedByUid: "u1",
  approvedByUid: "u2",
  approvalNotes: "private note",
  enc: { v: 1 },
  approvalEnc: { v: 1 },
  published: { decisions: ["Buy the hall"], agenda: ["Hall"], actionItems: [{ task: "Call bank", assignedTo: "Ann", dueDate: 1_700_100_000_000 }], attendance: { present: ["Ann", "Bobby"], absent: ["Cyrus"] }, signatures: { chairName: "Dil" } },
  approvedAt: 1_700_050_000_000,
  version: 2
};

describe("public archive entry", () => {
  it("shows approved content, with attendance as counts only", () => {
    const entry = toArchiveEntry(approved)!;
    expect(entry).toMatchObject({ id: "m1", decisions: ["Buy the hall"], attendance: { present: 2, absent: 1, guests: 0 }, version: 2 });
    expect(entry.actionItems).toEqual([{ task: "Call bank", dueDate: 1_700_100_000_000 }]);
  });

  it("leaks nothing internal", () => {
    const text = JSON.stringify(toArchiveEntry(approved));
    for (const secret of ["Alice", "u1", "u2", "private note", "Ann", "Bobby", "Cyrus", "enc", "recordedBy"]) expect(text).not.toContain(secret);
  });

  it("ignores anything that isn't approved", () => {
    expect(toArchiveEntry({ ...approved, status: "submitted" })).toBeNull();
    expect(toArchiveEntry({ ...approved, status: "draft" })).toBeNull();
  });
});
