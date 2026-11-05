import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Phase 12-B (plan §16): the daily digest of overdue tasks. Off until a super admin switches it on; called by the
 * schedule with a secret; once a day; one email per person with their overdue tasks across recent and upcoming
 * events; consent, cooldown and the shared daily limit are respected.
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
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: body.map((_: unknown, i: number) => ({ id: `d${batches.length}-${i}` })) }));
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
const CRON = "/api/cron/task-digest";
const AUTH = { Authorization: "Bearer test-cron-secret-0123456789" };
const utcDay = () => new Date().toISOString().slice(0, 10);

test.beforeEach(async () => {
  batches.length = 0;
  failNext = false;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const { db } = admin();
  const event = (id: string, title: string, offsetDays: number) =>
    db.doc(`${ORG}/events/${id}`).set({ title, body: "Details.", status: "published", startsAt: Timestamp.fromMillis(Date.now() + offsetDays * DAY), timezone: "America/New_York" });
  await event("ev1", "Dashain celebration", 10);
  await event("ev2", "General meeting", -3);
  await event("ev3", "Old gathering", -30);
  const ready = (name: string, email: string) => ({ name, email, emailLower: email, status: "active", roles: ["member"], emailConsent: { source: "admin_on_request" } });
  await db.doc(`${ORG}/members/asha`).set(ready("Asha Rai", "asha@example.org"));
  await db.doc(`${ORG}/members/bina`).set(ready("Bina Thapa", "bina@example.org"));
  await db.doc(`${ORG}/members/dinesh`).set({ name: "Dinesh Gurung", emailLower: "", status: "active", roles: ["member"], hasPhone: true });
  const task = (id: string, eventId: string, title: string, over: Record<string, unknown>) =>
    db.doc(`${ORG}/eventTasks/${id}`).set({ eventId, title, notes: "", groupId: null, memberIds: [], dueOn: "2020-01-01", status: "open", order: 10, doneAt: null, doneBy: null, ...over });
  await task("t1", "ev1", "Cook dal bhat", { memberIds: ["asha"], notes: "SECRET kitchen note" });
  await task("t2", "ev1", "Buy rice", { memberIds: ["bina"] });
  await task("t3", "ev2", "Clean the hall", { memberIds: ["asha"] });
  await task("t4", "ev3", "Return keys from last month", { memberIds: ["asha"] });
  await task("t5", "ev1", "Print programs", { memberIds: ["bina"], dueOn: "2999-01-01" });
  await task("t6", "ev1", "Book the hall", { memberIds: ["bina"], status: "done" });
  await task("t7", "ev1", "Phone the caterer", { memberIds: ["dinesh"] });
  await task("t8", "ev1", "Orphan task", {});
});

test("the schedule is configured and its route refuses anyone without the secret", async ({ request }) => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };
  expect(config.crons).toEqual([{ path: CRON, schedule: "0 13 * * *" }]);
  expect((await request.get(CRON)).status()).toBe(401);
  expect((await request.get(CRON, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.get(CRON, { headers: { Authorization: "test-cron-secret-0123456789" } })).status()).toBe(401);
  expect((await request.post(CRON, { headers: AUTH })).status()).toBe(405);
});

test("off by default; once switched on it sends one digest per person, once a day, and respects the limits", async ({ request }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  const run = async () => (await request.get(CRON, { headers: AUTH })).json() as Promise<Record<string, unknown>>;

  // Off: nothing is sent, whatever is overdue.
  expect(await run()).toEqual({ ran: false, reason: "off" });
  expect(batches).toHaveLength(0);

  await db.doc(`${ORG}/taskDigest/settings`).set({ enabled: true });
  const first = await run();
  expect(first).toMatchObject({ ran: true, status: "sent", emailed: 2, failed: 0, deferred: 0 });
  expect(batches).toHaveLength(1);
  expect(batches[0].key).toMatch(/^ghmo-digest-\d{4}-\d{2}-\d{2}-/);
  const mails = Object.fromEntries(batches[0].body.map(m => [m.to[0], m]));
  expect(Object.keys(mails).sort()).toEqual(["asha@example.org", "bina@example.org"]);
  const asha = mails["asha@example.org"];
  expect(asha.subject).toBe("Reminder: tasks that are overdue");
  expect(asha.text).toContain("Hello Asha,");
  // Both events with overdue tasks, soonest first (the meeting three days ago, then the celebration).
  expect(asha.text).toMatch(/General meeting[^\n]*\n- Clean the hall \(was due Jan 1, 2020\)[\s\S]*Dashain celebration[^\n]*\n- Cook dal bhat/);
  for (const other of ["Return keys from last month", "Buy rice", "Print programs", "Book the hall", "Phone the caterer", "Orphan task", "SECRET"]) expect(asha.text).not.toContain(other);
  expect(mails["bina@example.org"].text).toContain("- Buy rice");
  expect(mails["bina@example.org"].text).not.toContain("Print programs");
  for (const mail of Object.values(mails)) {
    expect(mail.text).toContain("Test Org");
    expect(mail.text).toMatch(/\/unsubscribe\?token=/);
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  }
  const settings = (await db.doc(`${ORG}/taskDigest/settings`).get()).data()!;
  expect(settings.lastRun).toMatchObject({ status: "sent", emailed: 2, cannotEmail: 1, unassigned: 1 });
  expect(settings.lastRunDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(settings.runningSince).toBeUndefined();
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent")).toBe(2);
  expect((await db.collection(`${ORG}/eventTaskReminders`).where("kind", "==", "digest").get()).size).toBe(2);
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "task_digest_run").get()).docs.map(d => d.data());
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toMatch(/Cook dal bhat|asha@example/);

  // A second call the same day does nothing.
  expect(await run()).toEqual({ ran: false, reason: "already_ran" });
  expect(batches).toHaveLength(1);

  // A new day, but everyone was emailed less than 20 hours ago: nobody is emailed again.
  await db.doc(`${ORG}/taskDigest/settings`).set({ lastRunDay: "2000-01-01" }, { merge: true });
  expect(await run()).toMatchObject({ ran: true, status: "nothing_to_send", emailed: 0 });
  expect(batches).toHaveLength(1);

  // 21 hours later they are due again, and the provider is down: nothing is recorded, and a retry works.
  for (const d of (await db.collection(`${ORG}/eventTaskReminders`).where("kind", "==", "digest").get()).docs) await d.ref.update({ lastSentAt: new Date(Date.now() - 21 * 3600 * 1000) });
  await db.doc(`${ORG}/taskDigest/settings`).set({ lastRunDay: "2000-01-01" }, { merge: true });
  await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).set({ sent: 0, day: utcDay() });
  failNext = true;
  expect(await run()).toMatchObject({ ran: true, status: "failed", failed: 2, emailed: 0 });
  expect(batches).toHaveLength(1);
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent") ?? 0).toBe(0);
  expect((await db.doc(`${ORG}/taskDigest/settings`).get()).get("lastRunDay")).toBe("2000-01-01");
  expect(await run()).toMatchObject({ ran: true, status: "sent", emailed: 2 });
  expect(batches).toHaveLength(2);

  // The shared daily limit: with 99 used only one digest fits; the other waits for tomorrow.
  for (const d of (await db.collection(`${ORG}/eventTaskReminders`).where("kind", "==", "digest").get()).docs) await d.ref.update({ lastSentAt: new Date(Date.now() - 21 * 3600 * 1000) });
  await db.doc(`${ORG}/taskDigest/settings`).set({ lastRunDay: "2000-01-01" }, { merge: true });
  await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).set({ sent: 99, day: utcDay() });
  expect(await run()).toMatchObject({ ran: true, status: "sent", emailed: 1, deferred: 1 });
  expect(batches[2].body).toHaveLength(1);
  expect((await db.doc(`${ORG}/broadcastQuota/${utcDay()}`).get()).get("sent")).toBe(100);
});

test("a super admin switches it on from the Events page and sees the last run; a plain admin can only look", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/events");
  await waitForStreamedContent(page);
  const card = page.locator("#admin-main").locator("section", { has: page.getByRole("heading", { name: "Daily overdue digest" }) });
  await expect(card.getByText("Off", { exact: true })).toBeVisible();
  await expect(card.getByText("It has not run yet.")).toBeVisible();
  await card.getByRole("button", { name: "Switch on" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Switch on" }).click();
  await expect(card.getByText("On", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/taskDigest/settings`).get()).get("enabled")).toBe(true);
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "task_digest_switched").get()).size).toBe(1);

  expect(await (await page.request.get(CRON, { headers: AUTH })).json()).toMatchObject({ ran: true, status: "sent", emailed: 2 });
  await page.reload();
  await waitForStreamedContent(page);
  await expect(card.getByText(/Last run .*: 2 people emailed/)).toBeVisible();
  await card.getByRole("button", { name: "Switch off" }).click();
  await expect(card.getByText("Off", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/taskDigest/settings`).get()).get("enabled")).toBe(false);

  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/events");
  await waitForStreamedContent(bob);
  const bobCard = bob.locator("#admin-main").locator("section", { has: bob.getByRole("heading", { name: "Daily overdue digest" }) });
  await expect(bobCard.getByText("Only a super admin can switch it on or off.")).toBeVisible();
  await expect(bobCard.getByRole("button", { name: /Switch/ })).toHaveCount(0);
  expect((await bob.request.put("/api/admin/task-digest", { data: { enabled: true } })).status()).toBe(403);
  await bobContext.close();
});
