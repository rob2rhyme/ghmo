import { describe, expect, it } from "vitest";
import {
  MAX_TASKS_PER_EVENT,
  checkTaskFields,
  cleanTaskNotes,
  cleanTaskTitle,
  countTasks,
  daysBetween,
  dueFromOffset,
  eventDay,
  isOverdue,
  normalizeTemplateItems,
  offsetFromDue,
  planTemplateApplication,
  sortTasks,
  taskTitleKey,
  templateItemsFromTasks
} from "@/src/lib/eventTasks";

const item = (title: string, over: Partial<{ notes: string; groupId: string | null; dueOffsetDays: number | null }> = {}) => ({ title, notes: "", groupId: null, dueOffsetDays: null, ...over });

describe("cleaning", () => {
  it("trims and collapses titles, keeps note line breaks, and caps lengths", () => {
    expect(cleanTaskTitle("  Book   the\n hall ")).toBe("Book the hall");
    expect(cleanTaskTitle(7)).toBe("");
    expect(cleanTaskTitle("x".repeat(300))).toHaveLength(120);
    expect(cleanTaskNotes(" a\r\nb ")).toBe("a\nb");
    expect(cleanTaskNotes("y".repeat(3000))).toHaveLength(1000);
  });
  it("compares titles without case or extra spaces", () => {
    expect(taskTitleKey("Book  HALL")).toBe(taskTitleKey("book hall"));
  });
});

describe("dates", () => {
  it("reads the event's own calendar day, not UTC", () => {
    // 7 PM Eastern on 12 Dec 2026 is already 13 Dec in UTC.
    const start = Date.parse("2026-12-13T00:00:00Z");
    expect(eventDay(start, "America/New_York")).toBe("2026-12-12");
    expect(eventDay(start, "UTC")).toBe("2026-12-13");
    expect(eventDay(null, "America/New_York")).toBeNull();
    expect(eventDay(Number.NaN, "UTC")).toBeNull();
  });

  it("counts whole days across a daylight-saving change", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
    expect(daysBetween("2026-11-10", "2026-10-25")).toBe(-16);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("puts a due date the right number of calendar days from the event, even across the November clock change", () => {
    // The clocks go back on 1 Nov 2026; seven days before 5 Nov is 29 Oct, not 30.
    expect(dueFromOffset("2026-11-05", -7)).toBe("2026-10-29");
    expect(dueFromOffset("2026-11-05", -5)).toBe("2026-10-31");
    expect(dueFromOffset("2026-11-05", 3)).toBe("2026-11-08");
    expect(dueFromOffset("2026-03-10", -10)).toBe("2026-02-28");
    expect(dueFromOffset(null, -3)).toBeNull();
    expect(dueFromOffset("2026-11-05", null)).toBeNull();
  });

  it("turns a due date back into an offset, and drops absurd ones", () => {
    expect(offsetFromDue("2026-11-05", "2026-10-29")).toBe(-7);
    expect(offsetFromDue("2026-11-05", "2026-11-05")).toBe(0);
    expect(offsetFromDue("2026-11-05", "2030-01-01")).toBeNull();
    expect(offsetFromDue(null, "2026-11-05")).toBeNull();
    expect(offsetFromDue("2026-11-05", null)).toBeNull();
  });
});

describe("status", () => {
  const open = { status: "open" as const, dueOn: "2026-11-01" };
  it("is overdue only while open and past due", () => {
    expect(isOverdue(open, "2026-11-02")).toBe(true);
    expect(isOverdue(open, "2026-11-01")).toBe(false);
    expect(isOverdue({ status: "done", dueOn: "2026-11-01" }, "2026-11-30")).toBe(false);
    expect(isOverdue({ status: "open", dueOn: null }, "2026-11-30")).toBe(false);
  });

  it("counts done, open and overdue", () => {
    const tasks = [open, { status: "done" as const, dueOn: "2026-10-01" }, { status: "open" as const, dueOn: "2026-12-01" }, { status: "open" as const, dueOn: null }];
    expect(countTasks(tasks, "2026-11-05")).toEqual({ total: 4, done: 1, open: 3, overdue: 1 });
    expect(countTasks([], "2026-11-05")).toEqual({ total: 0, done: 0, open: 0, overdue: 0 });
  });

  it("sorts open tasks first, soonest due first, undated last", () => {
    const sorted = sortTasks([
      { title: "Done early", status: "done" as const, dueOn: "2026-01-01", order: 10 },
      { title: "No date", status: "open" as const, dueOn: null, order: 10 },
      { title: "Later", status: "open" as const, dueOn: "2026-12-01", order: 10 },
      { title: "Sooner", status: "open" as const, dueOn: "2026-11-01", order: 20 }
    ]);
    expect(sorted.map(t => t.title)).toEqual(["Sooner", "Later", "No date", "Done early"]);
  });
});

describe("task fields", () => {
  it("refuses an unreal date and too many people", () => {
    expect(checkTaskFields({ dueOn: "2026-02-30" })).toContain("due date");
    expect(checkTaskFields({ dueOn: "" })).toBeNull();
    expect(checkTaskFields({ dueOn: null })).toBeNull();
    expect(checkTaskFields({ dueOn: "2026-11-05", memberIds: ["a", "b"] })).toBeNull();
    expect(checkTaskFields({ memberIds: Array.from({ length: 21 }, (_, i) => `m${i}`) })).toContain("at most 20");
  });
});

describe("templates", () => {
  it("cleans items: drops blanks and repeated titles, keeps whole-day offsets only", () => {
    const result = normalizeTemplateItems([
      { title: " Book hall ", dueOffsetDays: -14, groupId: "g1", notes: "Call first" },
      { title: "book HALL" },
      { title: "   " },
      { title: "Shop", dueOffsetDays: 1.5 },
      { title: "Far", dueOffsetDays: 9999 },
      null
    ]);
    expect(result).toEqual({
      ok: true,
      items: [
        { title: "Book hall", notes: "Call first", groupId: "g1", dueOffsetDays: -14 },
        { title: "Shop", notes: "", groupId: null, dueOffsetDays: null },
        { title: "Far", notes: "", groupId: null, dueOffsetDays: null }
      ]
    });
  });

  it("refuses an empty or oversized template", () => {
    expect(normalizeTemplateItems([])).toMatchObject({ ok: false });
    expect(normalizeTemplateItems("nope")).toMatchObject({ ok: false });
    expect(normalizeTemplateItems(Array.from({ length: 51 }, (_, i) => ({ title: `Task ${i}` })))).toMatchObject({ ok: false });
  });

  it("applies a template with due dates from the event day and skips titles already there", () => {
    const plan = planTemplateApplication({
      existing: [{ title: "Book HALL", order: 30 }],
      items: [item("Book hall", { dueOffsetDays: -14 }), item("Buy rice", { dueOffsetDays: -3, groupId: "shopping" }), item("Thank helpers", { dueOffsetDays: 2 }), item("Welcome sign")],
      eventDate: "2026-12-12"
    });
    expect(plan).toEqual({
      ok: true,
      skipped: 1,
      undated: 0,
      create: [
        { title: "Buy rice", notes: "", groupId: "shopping", dueOn: "2026-12-09", order: 40 },
        { title: "Thank helpers", notes: "", groupId: null, dueOn: "2026-12-14", order: 50 },
        { title: "Welcome sign", notes: "", groupId: null, dueOn: null, order: 60 }
      ]
    });
  });

  it("applying the same template twice changes nothing the second time", () => {
    const items = [item("A", { dueOffsetDays: -1 }), item("B")];
    const first = planTemplateApplication({ existing: [], items, eventDate: "2026-12-12" });
    expect(first).toMatchObject({ ok: true, skipped: 0 });
    const created = (first as { create: { title: string; order: number }[] }).create;
    expect(planTemplateApplication({ existing: created, items, eventDate: "2026-12-12" })).toEqual({ ok: true, create: [], skipped: 2, undated: 0 });
  });

  it("keeps tasks whose date is already past, and says how many have no event date to count from", () => {
    const plan = planTemplateApplication({ existing: [], items: [item("Late", { dueOffsetDays: -30 })], eventDate: "2026-12-12" });
    expect(plan).toMatchObject({ ok: true, create: [{ dueOn: "2026-11-12" }] });
    const noDate = planTemplateApplication({ existing: [], items: [item("A", { dueOffsetDays: -2 }), item("B")], eventDate: null });
    expect(noDate).toMatchObject({ ok: true, undated: 1 });
  });

  it("refuses a template that would push an event past the task limit", () => {
    const existing = Array.from({ length: MAX_TASKS_PER_EVENT }, (_, i) => ({ title: `T${i}`, order: i }));
    expect(planTemplateApplication({ existing, items: [item("One more")], eventDate: null })).toMatchObject({ ok: false });
  });

  it("builds template items from an event's tasks, keeping dates relative", () => {
    const items = templateItemsFromTasks(
      [
        { title: "B", notes: "", groupId: null, dueOn: null, order: 20 },
        { title: "A", notes: "n", groupId: "g", dueOn: "2026-12-09", order: 10 }
      ],
      "2026-12-12"
    );
    expect(items).toEqual([
      { title: "A", notes: "n", groupId: "g", dueOffsetDays: -3 },
      { title: "B", notes: "", groupId: null, dueOffsetDays: null }
    ]);
  });
});
