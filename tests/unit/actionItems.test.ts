import { describe, expect, it } from "vitest";
import { actionKey, buildItems } from "@/src/lib/actionItems";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";

const minutes = (over: Partial<MeetingMinutesRecord>): MeetingMinutesRecord =>
  ({ id: "m1", eventId: "e", eventTitle: "Board", meetingType: "Board", recordedBy: "A", agenda: [], decisions: [], actionItems: [], status: "approved", createdAt: 0, ...over }) as MeetingMinutesRecord;

describe("action items", () => {
  it("keys are stable for the same task and differ when the task or owner changes", async () => {
    expect(await actionKey("m1", "Call bank", "Ann")).toBe(await actionKey("m1", " Call bank ", "Ann"));
    expect(await actionKey("m1", "Call bank", "Ann")).not.toBe(await actionKey("m1", "Call bank", "Bo"));
    expect(await actionKey("m1", "Call bank")).not.toBe(await actionKey("m2", "Call bank"));
  });

  it("lists only approved minutes' items, applies tracked status, and puts overdue first", async () => {
    const now = Date.UTC(2026, 5, 1);
    const key = await actionKey("m1", "Sign lease");
    const items = await buildItems(
      [
        minutes({
          actionItems: [
            { task: "Later", dueDate: now + 86_400_000 },
            { task: "Sign lease", dueDate: now - 86_400_000 },
            { task: "Overdue", dueDate: now - 5 * 86_400_000 },
            { task: "No date" }
          ]
        }),
        minutes({ id: "m2", status: "draft", actionItems: [{ task: "Hidden" }] })
      ],
      new Map([[key, { status: "done" as const, note: "Signed Tuesday" }]]),
      now
    );
    expect(items.map(i => i.task)).toEqual(["Overdue", "Sign lease", "Later", "No date"]);
    expect(items.find(i => i.task === "Sign lease")).toMatchObject({ status: "done", note: "Signed Tuesday", overdue: false });
    expect(items.find(i => i.task === "Overdue")?.overdue).toBe(true);
    expect(items.some(i => i.task === "Hidden")).toBe(false);
  });
});
