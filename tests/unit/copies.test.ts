import { describe, expect, it } from "vitest";
import { EVENT_TITLE_MAX, copyTitle, eventCopyFields, taskCopyFields } from "@/src/lib/copies";

describe("copies", () => {
  it("marks a copied title and keeps it within the limit", () => {
    expect(copyTitle("Lhosar 2026")).toBe("Lhosar 2026 (copy)");
    expect(copyTitle("  ")).toBe("Untitled event (copy)");
    const long = copyTitle("x".repeat(200));
    expect(long).toHaveLength(EVENT_TITLE_MAX);
    expect(long.endsWith(" (copy)")).toBe(true);
  });

  it("copies an event's words and place, never its dates or publication", () => {
    const copy = eventCopyFields({ title: "Picnic", summary: "Bring food", body: "At the park", location: "Riverfront", timezone: "America/Chicago", status: "published", featured: true, startsAt: new Date(), endsAt: new Date(), announcementDocTemplate: "t1" });
    expect(copy).toEqual({ title: "Picnic (copy)", summary: "Bring food", body: "At the park", status: "draft", startsAt: null, endsAt: null, timezone: "America/Chicago", location: "Riverfront", featured: false, announcementDocTemplate: "t1", announcementPdfSource: null });
    expect(eventCopyFields({ title: "Bare" })).toMatchObject({ body: "Bare (copy)", timezone: "America/New_York", location: "", summary: "" });
  });

  it("copies a task undone, unassigned and undated, dropping a group that no longer works", () => {
    const task = { title: "Book the hall", notes: "Ask for the big room", groupId: "cook", order: 3, memberIds: ["m1"], status: "done", dueOn: "2026-01-01" };
    expect(taskCopyFields(task, new Set(["cook"]))).toEqual({ title: "Book the hall", notes: "Ask for the big room", groupId: "cook", memberIds: [], dueOn: null, status: "open", order: 3, doneAt: null, doneBy: null });
    expect(taskCopyFields(task, new Set()).groupId).toBeNull();
  });
});
