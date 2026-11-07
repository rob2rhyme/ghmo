import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Copying (plan §30, 23-A): an event becomes a new draft with no dates and, by default, its tasks (not done, nobody on
 * them, no due dates); a broadcast in any state becomes a new draft that needs approval again; the originals stay as they were.
 */
const ORG = "organizations/ghmo";
const { db } = admin();

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await db.doc(`${ORG}/events/pic1`).set({ title: "Summer picnic", summary: "Bring a dish", body: "At the river park.", status: "published", featured: true, location: "Riverfront Park", startsAt: Timestamp.fromMillis(Date.UTC(2026, 6, 4, 16)), timezone: "America/New_York" });
  await db.doc(`${ORG}/groups/cook`).set({ name: "Cooking team", description: "", leadMemberId: null, kind: null, active: true, builtIn: false });
  await db.doc(`${ORG}/groups/gone`).set({ name: "Old team", description: "", leadMemberId: null, kind: null, active: false, builtIn: false });
  const task = (id: string, extra: Record<string, unknown>) => db.doc(`${ORG}/eventTasks/${id}`).set({ eventId: "pic1", notes: "", memberIds: [], dueOn: null, status: "open", order: 0, doneAt: null, doneBy: null, createdAt: new Date(), updatedAt: new Date(), ...extra });
  await task("t1", { title: "Cook rice", groupId: "cook", memberIds: ["m1"], dueOn: "2026-07-03", status: "done", doneAt: new Date(), doneBy: "alice", order: 1 });
  await task("t2", { title: "Bring tents", groupId: "gone", notes: "Four big ones", order: 2 });
});

test("an event is copied as a dateless draft with its tasks, or without them", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/events");
  await page.goto("/admin/events/pic1/edit");
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Copy event…" }).click();
  const dialog = page.getByRole("dialog", { name: "Copy this event?" });
  await expect(dialog.getByRole("checkbox", { name: /Also copy its tasks/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Copy event" }).click();
  await page.waitForURL(url => /\/admin\/events\/[^/]+\/edit$/.test(url.pathname) && !url.pathname.includes("pic1"));
  await expect(page.getByText("Copied with 2 tasks. Set the new dates, then save.")).toBeVisible();

  const copies = (await db.collection(`${ORG}/events`).where("copiedFrom", "==", "pic1").get()).docs;
  expect(copies).toHaveLength(1);
  expect(copies[0].data()).toMatchObject({ title: "Summer picnic (copy)", summary: "Bring a dish", body: "At the river park.", status: "draft", featured: false, location: "Riverfront Park", startsAt: null, endsAt: null });
  const tasks = (await db.collection(`${ORG}/eventTasks`).where("eventId", "==", copies[0].id).get()).docs.map(d => d.data()).sort((a, b) => a.order - b.order);
  expect(tasks.map(t => [t.title, t.status, t.memberIds, t.dueOn, t.groupId, t.notes])).toEqual([
    ["Cook rice", "open", [], null, "cook", ""],
    ["Bring tents", "open", [], null, null, "Four big ones"]
  ]);
  // The original is untouched.
  expect((await db.doc(`${ORG}/events/pic1`).get()).get("status")).toBe("published");
  expect((await db.doc(`${ORG}/eventTasks/t1`).get()).get("status")).toBe("done");

  // Without tasks.
  await page.goto("/admin/events/pic1/edit");
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Copy event…" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: /Also copy its tasks/ }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Copy event" }).click();
  await expect(page.getByText("Copied. Set the new dates, then save.")).toBeVisible();
  const all = (await db.collection(`${ORG}/events`).where("copiedFrom", "==", "pic1").get()).docs;
  expect(all).toHaveLength(2);
  const second = all.find(d => d.id !== copies[0].id)!;
  expect((await db.collection(`${ORG}/eventTasks`).where("eventId", "==", second.id).get()).size).toBe(0);

  const actions = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "event_copied").get()).docs.map(d => d.get("resource.summary"));
  expect(actions.sort()).toEqual(["Summer picnic", "Summer picnic with 2 tasks"]);
});

test("a cancelled broadcast is copied as a new draft that needs approval again", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const created = await page.request.post("/api/admin/broadcasts", { data: { subject: "Monthly reminder", body: "Dues are due on the first." } });
  expect(created.status()).toBe(201);
  const { broadcast } = (await created.json()) as { broadcast: { id: string } };
  expect((await page.request.patch(`/api/admin/broadcasts/${broadcast.id}`, { data: { action: "cancel" } })).status()).toBe(200);

  await page.goto(`/admin/broadcasts/${broadcast.id}`);
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Copy as new draft" }).click();
  await page.waitForURL(url => /\/admin\/broadcasts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(broadcast.id));
  await expect(page.getByText("Copied as a new draft. Edit it, then submit it for approval.")).toBeVisible();

  const copies = (await db.collection(`${ORG}/broadcasts`).where("copiedFrom", "==", broadcast.id).get()).docs;
  expect(copies).toHaveLength(1);
  expect(copies[0].data()).toMatchObject({ subject: "Monthly reminder", body: "Dues are due on the first.", status: "draft", createdByUid: "alice" });
  expect(copies[0].data()).not.toHaveProperty("approvedHash");
  expect((await db.doc(`${ORG}/broadcasts/${broadcast.id}`).get()).get("status")).toBe("cancelled");
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "broadcast_copied").get()).size).toBe(1);
  expect((await page.request.post("/api/admin/broadcasts/nope/copy")).status()).toBe(404);
});
