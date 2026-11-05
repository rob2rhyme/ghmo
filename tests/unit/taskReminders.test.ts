import { describe, expect, it } from "vitest";
import { CLAIM_IN_FLIGHT_MS, MAX_REMINDERS_PER_SEND, REMINDER_COOLDOWN_MS, cannotEmailLabel, planReminders, reminderEmail, taskOwners } from "@/src/lib/taskReminders";

const now = new Date("2026-12-01T15:00:00Z");
const today = "2026-12-01";

const ready = (name: string, email = `${name.toLowerCase().replace(/\s+/g, ".")}@example.org`) => ({ name, emailLower: email, status: "active", emailConsent: { source: "admin_on_request" } });
const task = (id: string, title: string, over: Partial<{ dueOn: string | null; status: "open" | "done"; groupId: string | null; memberIds: string[]; order: number }> = {}) => ({
  id,
  title,
  dueOn: null,
  status: "open" as const,
  groupId: null,
  memberIds: [],
  order: 10,
  ...over
});
const plan = (over: Partial<Parameters<typeof planReminders>[0]> & Pick<Parameters<typeof planReminders>[0], "tasks" | "members">) =>
  planReminders({ groups: [], history: new Map(), mode: "all", today, now, ...over });

describe("taskOwners", () => {
  it("is the named people plus the lead of the group, once each, never the whole group", () => {
    const groups = [{ id: "cooking", leadMemberId: "lead" }];
    expect(taskOwners({ groupId: "cooking", memberIds: ["a", "lead"] }, groups).sort()).toEqual(["a", "lead"]);
    expect(taskOwners({ groupId: "cooking", memberIds: [] }, groups)).toEqual(["lead"]);
    expect(taskOwners({ groupId: "cooking", memberIds: ["a"] }, [{ id: "cooking", leadMemberId: null }])).toEqual(["a"]);
    expect(taskOwners({ groupId: "gone", memberIds: [] }, groups)).toEqual([]);
    expect(taskOwners({ groupId: null, memberIds: ["a"] }, groups)).toEqual(["a"]);
  });
});

describe("planReminders", () => {
  it("gives each person one entry listing only their own open tasks", () => {
    const result = plan({
      tasks: [task("t1", "Cook", { memberIds: ["asha"], dueOn: "2026-12-05" }), task("t2", "Shop", { memberIds: ["asha", "bina"] }), task("t3", "Done already", { memberIds: ["bina"], status: "done" })],
      members: new Map([["asha", ready("Asha Rai")], ["bina", ready("Bina Thapa")]])
    });
    expect(result.recipients.map(r => [r.name, r.lines.map(l => l.title)])).toEqual([
      ["Asha Rai", ["Cook", "Shop"]],
      ["Bina Thapa", ["Shop"]]
    ]);
    expect(result.cannotEmail).toEqual([]);
    expect(result.unassigned).toBe(0);
  });

  it("sends the group's tasks to its lead only", () => {
    const result = plan({ tasks: [task("t1", "Cook for 60", { groupId: "cooking" })], groups: [{ id: "cooking", leadMemberId: "lead" }], members: new Map([["lead", ready("Lena Rai")], ["cook2", ready("Another Cook")]]) });
    expect(result.recipients.map(r => r.memberId)).toEqual(["lead"]);
  });

  it("counts tasks nobody can be reminded about", () => {
    const result = plan({ tasks: [task("t1", "Nobody", {}), task("t2", "Group without lead", { groupId: "g" })], groups: [{ id: "g", leadMemberId: null }], members: new Map() });
    expect(result.unassigned).toBe(2);
    expect(result.recipients).toEqual([]);
  });

  it("only reminds about overdue tasks in overdue mode", () => {
    const tasks = [task("t1", "Late", { memberIds: ["asha"], dueOn: "2026-11-30" }), task("t2", "On time", { memberIds: ["asha"], dueOn: "2026-12-01" }), task("t3", "Undated", { memberIds: ["bina"] })];
    const members = new Map([["asha", ready("Asha Rai")], ["bina", ready("Bina Thapa")]]);
    const result = plan({ tasks, members, mode: "overdue" });
    expect(result.recipients).toEqual([{ memberId: "asha", name: "Asha Rai", lines: [{ title: "Late", dueOn: "2026-11-30", overdue: true }] }]);
    expect(result.unassigned).toBe(0);
  });

  it("never emails someone who can't be emailed, and says why", () => {
    const base = { emailLower: "x@example.org", status: "active" };
    const result = plan({
      tasks: [task("t", "Job", { memberIds: ["phone", "noconsent", "out", "bounced", "off", "gone", "ok"] })],
      members: new Map<string, ReturnType<typeof ready> | Record<string, unknown>>([
        ["phone", { name: "Phone Only", emailLower: "", status: "active" }],
        ["noconsent", { ...base, name: "No Consent" }],
        ["out", { ...ready("Opted Out"), emailOptOutAt: new Date() }],
        ["bounced", { ...ready("Bounced"), emailBounced: true }],
        ["off", { ...ready("Disabled"), status: "disabled" }],
        ["ok", ready("Okay Person")]
      ]),
    });
    expect(result.recipients.map(r => r.name)).toEqual(["Okay Person"]);
    expect(Object.fromEntries(result.cannotEmail.map(c => [c.memberId, c.reason]))).toEqual({
      phone: "no_email",
      noconsent: "no_consent",
      out: "opted_out",
      bounced: "bounced",
      off: "inactive",
      gone: "missing"
    });
  });

  it("holds back people reminded in the last 24 hours or with a send under way, but not older ones", () => {
    const members = new Map([["a", ready("A One")], ["b", ready("B Two")], ["c", ready("C Three")], ["d", ready("D Four")]]);
    const tasks = [task("t", "Job", { memberIds: ["a", "b", "c", "d"] })];
    const history = new Map([
      ["a", { lastSentAt: new Date(now.getTime() - REMINDER_COOLDOWN_MS + 60_000) }],
      ["b", { lastSentAt: new Date(now.getTime() - REMINDER_COOLDOWN_MS - 60_000) }],
      ["c", { claimedAt: new Date(now.getTime() - CLAIM_IN_FLIGHT_MS + 1000) }],
      ["d", { claimedAt: new Date(now.getTime() - CLAIM_IN_FLIGHT_MS - 1000) }]
    ]);
    const result = plan({ tasks, members, history });
    expect(result.recentlyReminded.map(r => r.memberId)).toEqual(["a", "c"]);
    expect(result.recipients.map(r => r.memberId)).toEqual(["b", "d"]);
  });

  it("caps one send and says how many are left for the next", () => {
    const ids = Array.from({ length: MAX_REMINDERS_PER_SEND + 7 }, (_, i) => `m${String(i).padStart(2, "0")}`);
    const members = new Map(ids.map(id => [id, ready(`Person ${id}`)]));
    const result = plan({ tasks: [task("t", "Job", { memberIds: ids })], members });
    expect(result.recipients).toHaveLength(MAX_REMINDERS_PER_SEND);
    expect(result.more).toBe(7);
  });
});

describe("reminderEmail", () => {
  it("lists the person's own tasks with due dates and says when one is overdue", () => {
    const mail = reminderEmail({
      eventTitle: "Dashain celebration",
      eventDay: "2026-12-12",
      recipientName: "Asha Rai",
      lines: [
        { title: "Cook dal bhat for 60", dueOn: "2026-12-09", overdue: false },
        { title: "Send the notice", dueOn: "2026-11-30", overdue: true },
        { title: "Buy rice", dueOn: null, overdue: false }
      ]
    });
    expect(mail.subject).toBe("Reminder: your tasks for Dashain celebration");
    expect(mail.text).toContain("Hello Asha,");
    expect(mail.text).toContain("for Dashain celebration (Dec 12, 2026):");
    expect(mail.text).toContain("- Cook dal bhat for 60 (due Dec 9, 2026)");
    expect(mail.text).toContain("- Send the notice (due Nov 30, 2026, overdue)");
    expect(mail.text).toContain("- Buy rice (no due date)");
    expect(mail.text).toContain("tell the person who gave it to you");
  });

  it("copes with a missing name or date and keeps titles on one line", () => {
    const mail = reminderEmail({ eventTitle: "Big\nmeeting", eventDay: null, recipientName: "", lines: [{ title: "Line\none", dueOn: null, overdue: false }] });
    expect(mail.subject).toBe("Reminder: your tasks for Big meeting");
    expect(mail.text).toContain("Hello there,");
    expect(mail.text).toContain("- Line one (no due date)");
    expect(mail.text).not.toContain("(Dec");
  });
});

describe("cannotEmailLabel", () => {
  it("has plain words for every reason, and tells the admin to phone a phone-only member", () => {
    expect(cannotEmailLabel("no_email")).toContain("phone them");
    for (const reason of ["no_consent", "opted_out", "bounced", "inactive", "missing"] as const) expect(cannotEmailLabel(reason).length).toBeGreaterThan(5);
  });
});
