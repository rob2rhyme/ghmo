import { describe, expect, it } from "vitest";
import { ACTIVITY_AREAS, actionsInArea, activityCsv, areaOf, changedFields, recordHref } from "@/src/lib/activityLog";
import { LABELLED_ACTIONS } from "@/src/lib/adminView";

describe("areas", () => {
  it("puts each action in one area", () => {
    expect(areaOf("member_email_changed")).toBe("members");
    expect(areaOf("members_status_bulk")).toBe("members");
    expect(areaOf("event_task_done")).toBe("events");
    expect(areaOf("task_digest_run")).toBe("events");
    expect(areaOf("minutes_moved")).toBe("minutes");
    expect(areaOf("broadcast_sent")).toBe("broadcasts");
    expect(areaOf("group_members_changed")).toBe("people");
    expect(areaOf("call_attempt_recorded")).toBe("calls");
    expect(areaOf("login")).toBe("security");
    expect(areaOf("admin_role_changed")).toBe("security");
    expect(areaOf("admin_chat_message_sent")).toBe("other");
    expect(areaOf("comms_thread_created")).toBe("other");
    expect(areaOf("something_new")).toBe("other");
  });

  it("lists each area's actions, and every labelled action has an area", () => {
    // The read route asks Firestore in chunks of 30 (its limit for "in"), so an area may hold more.
    for (const area of ACTIVITY_AREAS.filter(area => area !== "other")) expect(actionsInArea(area, LABELLED_ACTIONS).length).toBeGreaterThan(0);
    const covered = ACTIVITY_AREAS.flatMap(area => actionsInArea(area, LABELLED_ACTIONS));
    expect(new Set(covered).size).toBe(new Set(LABELLED_ACTIONS).size);
    expect(actionsInArea("minutes", LABELLED_ACTIONS)).toContain("minutes_moved");
  });
});

describe("changedFields", () => {
  it("shows plain fields that differ, before → after, in order", () => {
    expect(changedFields({ name: "Mongal Puwrt", status: "active", updatedAt: 1, hasEmail: true }, { name: "Mongal Puwart", status: "active", updatedAt: 2, hasEmail: true })).toEqual([
      { field: "name", before: "Mongal Puwrt", after: "Mongal Puwart" }
    ]);
    expect(changedFields(undefined, { kind: "changed", oldAddressKept: true })).toEqual([
      { field: "kind", before: "", after: "changed" },
      { field: "oldAddressKept", before: "", after: "true" }
    ]);
    expect(changedFields({ groupIds: ["a"] }, { groupIds: ["a", "b"] })).toEqual([{ field: "groupIds", before: "a", after: "a, b" }]);
  });

  it("leaves out nested objects and caps the list", () => {
    expect(changedFields({ contact: { v: 1 } }, { contact: { v: 2 } })).toEqual([]);
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${String(i).padStart(2, "0")}`, i]));
    expect(changedFields({}, many, 5)).toHaveLength(5);
    expect(changedFields({}, { long: "x".repeat(300) })[0].after).toHaveLength(201);
  });
});

describe("recordHref", () => {
  it("links to records that can still exist", () => {
    expect(recordHref({ action: "member_email_changed", resourceId: "m1" }, { superAdmin: false })).toBe("/admin/members/m1");
    expect(recordHref({ action: "member_deleted", resourceId: "m1" }, { superAdmin: true })).toBeNull();
    expect(recordHref({ action: "event_updated", resourceId: "e1" }, { superAdmin: false })).toBe("/admin/events/e1/edit");
    expect(recordHref({ action: "event_deleted", resourceId: "e1" }, { superAdmin: false })).toBeNull();
    expect(recordHref({ action: "minutes_moved", resourceId: "n1" }, { superAdmin: false })).toBe("/admin/minutes?mode=new&minutesId=n1");
    expect(recordHref({ action: "broadcast_sent", resourceId: "b1" }, { superAdmin: false })).toBe("/admin/broadcasts/b1");
    expect(recordHref({ action: "group_created", resourceId: "g1" }, { superAdmin: false })).toBe("/admin/groups/g1");
    expect(recordHref({ action: "position_term_added", resourceId: "t1" }, { superAdmin: false })).toBe("/admin/positions");
    expect(recordHref({ action: "admin_added", resourceId: "a1" }, { superAdmin: false })).toBeNull();
    expect(recordHref({ action: "admin_added", resourceId: "a1" }, { superAdmin: true })).toBe("/admin/admins");
    expect(recordHref({ action: "member_updated", resourceId: "../x" }, { superAdmin: true })).toBeNull();
  });
});

describe("activityCsv", () => {
  const row = { when: "Nov 6, 2026 9:00 AM", person: "=Alice", role: "Super admin", text: "Alice changed a member's email", area: "members" as const, ip: "1.2.3.4", userAgent: "Chrome, on Mac" };
  it("has the device columns only for super admins, and is safe to open", () => {
    const plain = activityCsv([row], { withDevice: false });
    expect(plain.split("\r\n")[0]).toBe("When,Person,Role,What,Detail,Area");
    expect(plain).not.toContain("1.2.3.4");
    expect(plain).toContain("'=Alice");
    const full = activityCsv([row], { withDevice: true });
    expect(full.split("\r\n")[0]).toContain("Internet address,Browser");
    expect(full).toContain('"Chrome, on Mac"');
  });
});
