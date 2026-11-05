import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Phase 11-B (plan §15): a task checklist per event, given to groups and people, with templates that count due
 * dates from the event day. Stored in plaintext by the server, outside the event document, so it never reaches the
 * public site.
 */

const ORG = "organizations/ghmo";
const DAY = 24 * 3600 * 1000;
const main = (page: Page) => page.locator("#admin-main");
const panel = (page: Page) => main(page).locator("section", { has: page.getByRole("heading", { name: "Tasks", exact: true }) });
/** The event's calendar day in New York, the way the app counts it. */
const dayOf = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const startOne = Date.now() + 10 * DAY;
const startTwo = Date.now() + 30 * DAY;

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const { db } = admin();
  for (const [id, title, start] of [["ev1", "Dashain celebration", startOne], ["ev2", "General meeting", startTwo]] as const) {
    await db.doc(`${ORG}/events/${id}`).set({ title, body: "Details.", status: "published", startsAt: Timestamp.fromMillis(start), timezone: "America/New_York" });
  }
  for (const [id, name] of [["asha", "Asha Rai"], ["bina", "Bina Thapa"]]) {
    await db.doc(`${ORG}/members/${id}`).set({ email: `${id}@example.org`, emailLower: `${id}@example.org`, name, status: "active", roles: ["member"] });
  }
  for (const [id, name] of [["cooking", "Cooking team"], ["shopping", "Shopping team"]]) {
    await db.doc(`${ORG}/groups/${id}`).set({ name, description: "", leadMemberId: null, kind: null, active: true, builtIn: false });
  }
});

test("tasks: add, give to a group and people, finish, see overdue, save as a template and reuse it", async ({ page }) => {
  test.setTimeout(180_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.goto("/admin/events/ev1/edit");
  await waitForStreamedContent(page);
  await expect(panel(page).getByText("No tasks yet")).toBeVisible();

  // Add a task for the cooking team with named people and a due date three days before the event.
  const due = plusDays(dayOf(startOne), -3);
  await page.getByRole("button", { name: "Add task" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task", { exact: true }).fill("Cook dal bhat for 60");
  await dialog.getByLabel("Group").selectOption({ label: "Cooking team" });
  await dialog.getByLabel("Due on (optional)").fill(due);
  await dialog.getByLabel("Notes (optional)").fill("Rice for 60 as well");
  await dialog.getByLabel("Asha Rai").check();
  await dialog.getByRole("button", { name: "Save task" }).click();
  await expect(panel(page).getByText("Cook dal bhat for 60")).toBeVisible();
  await expect(panel(page).getByText(/Asha Rai/)).toBeVisible();
  await expect(main(page).getByText("0 of 1 done")).toBeVisible();
  const stored = (await db.collection(`${ORG}/eventTasks`).get()).docs.map(d => d.data());
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ eventId: "ev1", groupId: "cooking", memberIds: ["asha"], dueOn: due, status: "open", createdBy: "alice" });

  // The same title again is refused in plain words.
  await page.getByRole("button", { name: "Add task" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task", { exact: true }).fill("cook DAL bhat for 60");
  await dialog.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("This event already has a task with that title.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // A task that was due long ago shows as overdue until it is finished.
  await page.getByRole("button", { name: "Add task" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task", { exact: true }).fill("Send the notice");
  await dialog.getByLabel("Due on (optional)").fill("2020-01-01");
  await dialog.getByRole("button", { name: "Save task" }).click();
  const notice = panel(page).getByRole("listitem").filter({ hasText: "Send the notice" });
  await expect(notice.getByText("Overdue")).toBeVisible();
  // The box changes once the server has saved it, so click and wait for the result.
  await notice.getByRole("checkbox").click();
  await expect(notice.getByText("Overdue")).toHaveCount(0);
  await expect(main(page).getByText("1 of 2 done")).toBeVisible();
  const done = (await db.collection(`${ORG}/eventTasks`).where("title", "==", "Send the notice").get()).docs[0].data();
  expect(done).toMatchObject({ status: "done", doneBy: "alice" });
  expect(done.doneAt).toBeTruthy();

  // Save as a template: due dates stay relative to the event day and people are not kept.
  await page.getByRole("button", { name: "Save as template" }).click();
  await page.getByRole("dialog").getByLabel("Template name").fill("Festival day");
  await page.getByRole("dialog").getByRole("button", { name: "Save template" }).click();
  await expect.poll(async () => (await db.collection(`${ORG}/eventTaskTemplates`).get()).size).toBe(1);
  const template = (await db.collection(`${ORG}/eventTaskTemplates`).get()).docs[0].data() as { name: string; items: Record<string, unknown>[] };
  expect(template.name).toBe("Festival day");
  expect(template.items).toEqual(
    expect.arrayContaining([
      { title: "Cook dal bhat for 60", notes: "Rice for 60 as well", groupId: "cooking", dueOffsetDays: -3 },
      // A date years away from the event is not a relative due date, so the template keeps no date for it.
      { title: "Send the notice", notes: "", groupId: null, dueOffsetDays: null }
    ])
  );
  expect(JSON.stringify(template)).not.toContain("asha");

  // Reuse it on another event: due dates count from that event's day, and doing it twice adds nothing new.
  await page.goto("/admin/events/ev2/edit");
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Use a template" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add these tasks" }).click();
  await expect(panel(page).getByText("Cook dal bhat for 60")).toBeVisible();
  const second = (await db.collection(`${ORG}/eventTasks`).where("eventId", "==", "ev2").get()).docs.map(d => d.data());
  expect(second).toHaveLength(2);
  expect(second.find(t => t.title === "Cook dal bhat for 60")).toMatchObject({ dueOn: plusDays(dayOf(startTwo), -3), groupId: "cooking", status: "open", memberIds: [] });
  await page.getByRole("button", { name: "Use a template" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add these tasks" }).click();
  await expect(page.getByText(/0 tasks added, 2 already there/)).toBeVisible();
  expect((await db.collection(`${ORG}/eventTasks`).where("eventId", "==", "ev2").get()).size).toBe(2);

  // The group page lists its tasks across events, with the event name.
  await page.goto("/admin/groups/cooking");
  await waitForStreamedContent(page);
  await expect(main(page).getByRole("listitem").filter({ hasText: "Cook dal bhat for 60" })).toHaveCount(2);
  await expect(main(page).getByText(/Dashain celebration/)).toBeVisible();
  await page.goto("/admin/groups");
  await waitForStreamedContent(page);
  await expect(main(page).getByText(/2 open tasks/)).toBeVisible();

  // Deleting a group keeps its tasks but takes the group off them.
  await page.goto("/admin/groups/cooking");
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete group" }).click();
  await expect.poll(async () => (await db.collection(`${ORG}/eventTasks`).where("groupId", "==", "cooking").get()).size).toBe(0);
  expect((await db.collection(`${ORG}/eventTasks`).get()).size).toBe(4);

  // Deleting an event deletes its tasks.
  const removed = await page.request.delete("/api/admin/organizations/ghmo/events/ev2");
  expect(removed.status()).toBe(200);
  expect((await db.collection(`${ORG}/eventTasks`).where("eventId", "==", "ev2").get()).size).toBe(0);
  expect((await db.collection(`${ORG}/eventTasks`).where("eventId", "==", "ev1").get()).size).toBe(2);

  // The audit log says what happened, without notes or names of people.
  const actions = (await db.collection(`${ORG}/auditLogs`).get()).docs.map(d => d.get("action"));
  for (const action of ["event_task_created", "event_task_done", "task_template_created", "event_tasks_template_applied", "group_deleted"]) expect(actions).toContain(action);
  expect(JSON.stringify((await db.collection(`${ORG}/auditLogs`).get()).docs.map(d => d.data()))).not.toContain("Rice for 60");
});

test("templates page: write a template by hand; only a super admin deletes one", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "bob", "/admin/events");
  await waitForStreamedContent(page);
  await page.getByRole("link", { name: "Task templates" }).click();
  await expect(main(page).getByText("No templates yet")).toBeVisible();

  await page.getByRole("button", { name: "New template" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template name").fill("General meeting");
  const first = dialog.getByRole("group", { name: "Task 1" });
  await first.getByLabel("Task", { exact: true }).fill("Book the hall");
  await first.getByLabel("Days (blank = no date)").fill("14");
  await dialog.getByRole("button", { name: "Add a task" }).click();
  const second = dialog.getByRole("group", { name: "Task 2" });
  await second.getByLabel("Task", { exact: true }).fill("Write the minutes");
  await second.getByLabel("Group").selectOption({ label: "Shopping team" });
  await second.getByLabel("Days (blank = no date)").fill("2");
  await second.getByLabel("Counted").selectOption("after");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(main(page).getByText("Book the hall")).toBeVisible();
  await expect(main(page).getByText(/14 days before/)).toBeVisible();
  await expect(main(page).getByText(/2 days after/)).toBeVisible();
  const stored = (await db.collection(`${ORG}/eventTaskTemplates`).get()).docs[0].data();
  expect(stored.items).toEqual([
    { title: "Book the hall", notes: "", groupId: null, dueOffsetDays: -14 },
    { title: "Write the minutes", notes: "", groupId: "shopping", dueOffsetDays: 2 }
  ]);

  // A plain admin can edit but not delete; the server refuses too.
  await expect(page.getByRole("button", { name: "Delete General meeting" })).toHaveCount(0);
  const id = (await db.collection(`${ORG}/eventTaskTemplates`).get()).docs[0].id;
  expect((await page.request.delete(`/api/admin/task-templates/${id}`)).status()).toBe(403);
  expect((await page.request.post("/api/admin/task-templates", { data: { name: "general MEETING", items: [{ title: "x" }] } })).status()).toBe(409);
  expect((await page.request.post("/api/admin/task-templates", { data: { name: "Empty", items: [{ title: "  " }] } })).status()).toBe(400);
  // Tasks can't be given to a group that doesn't exist, or reached through another event.
  expect((await page.request.post("/api/admin/organizations/ghmo/events/ev1/tasks", { data: { title: "Lost", groupId: "nope" } })).status()).toBe(404);
  const made = await page.request.post("/api/admin/organizations/ghmo/events/ev1/tasks", { data: { title: "Real task" } });
  const { task } = (await made.json()) as { task: { id: string } };
  expect((await page.request.patch(`/api/admin/organizations/ghmo/events/ev2/tasks/${task.id}`, { data: { status: "done" } })).status()).toBe(404);
  expect((await page.request.post("/api/admin/organizations/ghmo/events/ev1/tasks", { data: { title: "Bad date", dueOn: "2026-02-30" } })).status()).toBe(400);

  // A super admin can.
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  await signInWithNewPasskey(alice, "alice", "/admin/events/templates");
  await waitForStreamedContent(alice);
  await alice.getByRole("button", { name: "Delete General meeting" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete template" }).click();
  await expect.poll(async () => (await db.collection(`${ORG}/eventTaskTemplates`).get()).size).toBe(0);
  await aliceContext.close();
});
