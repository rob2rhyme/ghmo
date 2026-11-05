import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Phase 12-A (plan §16): an admin reminds the people who own an event's tasks. Only consented members are emailed,
 * each with only their own tasks; nobody is emailed twice in 24 hours; a failed send blocks nothing; the daily quota
 * is shared with broadcasts.
 */

type Message = { to: string[]; subject: string; text: string; headers?: Record<string, string> };
type Batch = { key?: string; body: Message[] };
const batches: Batch[] = [];
let failNext = false;
let stub: Server;

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      if (req.url?.endsWith("/batch")) {
        if (failNext) {
          failNext = false;
          res.writeHead(500, { "Content-Type": "application/json" }).end('{"error":"down"}');
          return;
        }
        batches.push({ key: req.headers["idempotency-key"] as string | undefined, body });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: body.map((_: unknown, i: number) => ({ id: `r${batches.length}-${i}` })) }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"stub"}');
      }
    });
  }).listen(4010, "127.0.0.1");
  await new Promise(resolve => stub.once("listening", resolve));
});
test.afterAll(() => new Promise(resolve => stub.close(() => resolve(undefined))));

const ORG = "organizations/ghmo";
const DAY = 24 * 3600 * 1000;
const utcDay = () => new Date().toISOString().slice(0, 10);

test.beforeEach(async () => {
  batches.length = 0;
  failNext = false;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  const { db } = admin();
  await db.doc(`${ORG}/events/ev1`).set({ title: "Dashain celebration", body: "Details.", status: "published", startsAt: Timestamp.fromMillis(Date.now() + 10 * DAY), timezone: "America/New_York" });
  const ready = (name: string, email: string) => ({ name, email, emailLower: email, status: "active", roles: ["member"], emailConsent: { source: "admin_on_request" } });
  await db.doc(`${ORG}/members/asha`).set(ready("Asha Rai", "asha@example.org"));
  await db.doc(`${ORG}/members/bina`).set(ready("Bina Thapa", "bina@example.org"));
  await db.doc(`${ORG}/members/gita`).set(ready("Gita Lead", "gita@example.org"));
  await db.doc(`${ORG}/members/dinesh`).set({ name: "Dinesh Gurung", emailLower: "", status: "active", roles: ["member"], hasPhone: true });
  await db.doc(`${ORG}/members/esha`).set({ name: "Esha Magar", email: "esha@example.org", emailLower: "esha@example.org", status: "active", roles: ["member"] });
  await db.doc(`${ORG}/members/farah`).set({ ...ready("Farah Khan", "farah@example.org"), emailOptOutAt: new Date() });
  await db.doc(`${ORG}/groups/cooking`).set({ name: "Cooking team", description: "", leadMemberId: "gita", kind: null, active: true, builtIn: false });
  const task = (id: string, title: string, over: Record<string, unknown>) =>
    db.doc(`${ORG}/eventTasks/${id}`).set({ eventId: "ev1", title, notes: "", groupId: null, memberIds: [], dueOn: null, status: "open", order: 10, doneAt: null, doneBy: null, ...over });
  await task("t1", "Cook dal bhat", { memberIds: ["asha"], dueOn: "2020-01-01", notes: "SECRET kitchen note" });
  await task("t2", "Buy rice", { memberIds: ["asha", "bina"] });
  await task("t3", "Book hall", { memberIds: ["dinesh"] });
  await task("t4", "Print programs", { memberIds: ["esha"] });
  await task("t5", "Welcome sign", { memberIds: ["farah"] });
  await task("t6", "Serve food", { groupId: "cooking" });
  await task("t7", "Orphan task", {});
  await task("t8", "Finished already", { memberIds: ["bina"], status: "done" });
});

test("a reminder reaches only consented people with only their own tasks, once, and is shared with the daily quota", async ({ page }) => {
  test.setTimeout(180_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.goto("/admin/events/ev1/edit");
  await waitForStreamedContent(page);

  // Preview: who would be emailed, who can't be and why.
  await page.getByRole("button", { name: "Send reminders" }).click();
  const dialog = page.getByRole("dialog");
  const will = dialog.getByRole("region", { name: "Will be emailed" });
  await expect(will.getByRole("heading", { name: "Will be emailed (3)" })).toBeVisible();
  await expect(will.getByText("Asha Rai: 2 tasks")).toBeVisible();
  await expect(will.getByText("Bina Thapa: 1 task")).toBeVisible();
  await expect(will.getByText("Gita Lead: 1 task")).toBeVisible();
  const cannot = dialog.getByRole("region", { name: "Can't be emailed" });
  await expect(cannot.getByText(/Dinesh Gurung has no email \(phone them\)/)).toBeVisible();
  await expect(cannot.getByText(/Esha Magar has not agreed to emails/)).toBeVisible();
  await expect(cannot.getByText(/Farah Khan asked not to be emailed/)).toBeVisible();
  await expect(dialog.getByText(/1 task has no named person and no group lead/)).toBeVisible();

  // Only overdue: just Asha, with one task.
  await dialog.getByLabel("Remind about").selectOption("overdue");
  await expect(will.getByRole("heading", { name: "Will be emailed (1)" })).toBeVisible();
  await expect(will.getByText("Asha Rai: 1 task")).toBeVisible();
  await expect(will.getByText("Bina Thapa")).toHaveCount(0);
  await dialog.getByLabel("Remind about").selectOption("all");
  await expect(will.getByRole("heading", { name: "Will be emailed (3)" })).toBeVisible();
  expect(batches).toHaveLength(0);

  // Send.
  await dialog.getByRole("button", { name: "Send 3 reminders" }).click();
  await expect(page.getByText("3 reminders sent")).toBeVisible();
  expect(batches).toHaveLength(1);
  expect(batches[0].key).toMatch(/^ghmo-reminder-ev1-/);
  const mails = Object.fromEntries(batches[0].body.map(m => [m.to[0], m]));
  expect(Object.keys(mails).sort()).toEqual(["asha@example.org", "bina@example.org", "gita@example.org"]);
  const asha = mails["asha@example.org"];
  expect(asha.subject).toBe("Reminder: your tasks for Dashain celebration");
  expect(asha.text).toContain("Hello Asha,");
  expect(asha.text).toMatch(/- Cook dal bhat \(due Jan 1, 2020, overdue\)/);
  expect(asha.text).toContain("- Buy rice (no due date)");
  for (const other of ["Book hall", "Print programs", "Welcome sign", "Orphan task", "Finished already", "SECRET"]) expect(asha.text).not.toContain(other);
  expect(mails["bina@example.org"].text).toContain("- Buy rice");
  expect(mails["bina@example.org"].text).not.toContain("Cook dal bhat");
  expect(mails["gita@example.org"].text).toContain("- Serve food");
  // Every email carries the footer, the unsubscribe link and the one-click header.
  for (const mail of Object.values(mails)) {
    expect(mail.text).toContain("Test Org");
    expect(mail.text).toContain("1 Main Street, Springfield");
    expect(mail.text).toMatch(/\/unsubscribe\?token=/);
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  }

  // Records, quota and audit.
  const reminders = (await db.collection(`${ORG}/eventTaskReminders`).get()).docs;
  expect(reminders.map(d => d.id).sort()).toEqual(["ev1~asha", "ev1~bina", "ev1~gita"]);
  expect(reminders.every(d => d.get("lastSentAt") && !d.get("claimedAt") && d.get("count") === 1 && d.get("lastSentBy") === "alice")).toBe(true);
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent")).toBe(3);
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "event_tasks_reminded").get()).docs.map(d => d.data());
  expect(audit).toHaveLength(1);
  expect(audit[0].after).toMatchObject({ emailed: 3, failed: 0, cannotEmail: 3 });
  expect(JSON.stringify(audit)).not.toMatch(/Cook dal bhat|asha@example/);

  // A second try within 24 hours sends nothing.
  await page.getByRole("button", { name: "Send reminders" }).click();
  const again = page.getByRole("dialog");
  await expect(again.getByRole("heading", { name: "Will be emailed (0)" })).toBeVisible();
  await expect(again.getByRole("heading", { name: "Reminded in the last 24 hours (3)" })).toBeVisible();
  await expect(again.getByRole("button", { name: /^Send 0 reminders$/ })).toBeDisabled();
  await again.getByRole("button", { name: "Cancel" }).click();
  const repeat = await page.request.post("/api/admin/organizations/ghmo/events/ev1/tasks/remind", { data: { mode: "all", send: true } });
  expect(repeat.status()).toBe(200);
  expect(await repeat.json()).toMatchObject({ emailed: 0, failed: 0 });
  expect(batches).toHaveLength(1);

  // Deleting the event removes its reminder records.
  expect((await page.request.delete("/api/admin/organizations/ghmo/events/ev1")).status()).toBe(200);
  expect((await db.collection(`${ORG}/eventTaskReminders`).get()).size).toBe(0);
});

test("a failed send blocks nothing, the daily quota is respected, and an unknown event or bad request is refused", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin");
  const url = "/api/admin/organizations/ghmo/events/ev1/tasks/remind";

  // The provider is down: nothing is recorded as sent, the quota is given back, and a retry works at once.
  failNext = true;
  const down = await page.request.post(url, { data: { mode: "all", send: true } });
  expect(down.status()).toBe(200);
  expect(await down.json()).toMatchObject({ emailed: 0, failed: 3 });
  expect(batches).toHaveLength(0);
  const afterFail = (await db.collection(`${ORG}/eventTaskReminders`).get()).docs;
  expect(afterFail.every(d => !d.get("lastSentAt") && !d.get("claimedAt") && !d.get("claimId"))).toBe(true);
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent") ?? 0).toBe(0);
  const retry = await page.request.post(url, { data: { mode: "all", send: true } });
  expect(await retry.json()).toMatchObject({ emailed: 3, failed: 0 });
  expect(batches).toHaveLength(1);

  // Opted-out and not-yet-consented people are never in the batch even if they own tasks.
  expect(batches[0].body.map(m => m.to[0]).sort()).toEqual(["asha@example.org", "bina@example.org", "gita@example.org"]);

  // The daily quota is shared: with 99 already used, three more are refused and nothing is sent or recorded.
  for (const d of (await db.collection(`${ORG}/eventTaskReminders`).get()).docs) await d.ref.delete();
  await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).set({ sent: 99, day: utcDay() });
  const full = await page.request.post(url, { data: { mode: "all", send: true } });
  expect(full.status()).toBe(409);
  expect(((await full.json()) as { error: string }).error).toMatch(/1 email is left today and 3 are needed/);
  expect(batches).toHaveLength(1);
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent")).toBe(99);

  // Bad requests and unknown events.
  expect((await page.request.post("/api/admin/organizations/ghmo/events/nope/tasks/remind", { data: { mode: "all", send: false } })).status()).toBe(404);
  expect((await page.request.post(url, { data: { mode: "everyone" } })).status()).toBe(400);
  const preview = await page.request.post(url, { data: { mode: "all" } });
  expect(preview.status()).toBe(200);
  expect(await preview.json()).toMatchObject({ blocker: null, quotaLeft: 1 });
});
