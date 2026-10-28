import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

type Batch = { path: string; key?: string; body: { to: string[]; subject: string; text: string; headers?: Record<string, string> }[] };
const batches: Batch[] = [];
let stub: Server;

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      if (req.url?.endsWith("/batch")) {
        batches.push({ path: req.url, key: req.headers["idempotency-key"] as string | undefined, body });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: body.map((_: unknown, i: number) => ({ id: `e${batches.length}-${i}` })) }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"stub"}');
      }
    });
  }).listen(4010, "127.0.0.1");
  await new Promise(resolve => stub.once("listening", resolve));
});
test.afterAll(() => new Promise(resolve => stub.close(() => resolve(undefined))));

const ORG = "organizations/ghmo";

test.beforeEach(async () => {
  batches.length = 0;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  const { db } = admin();
  for (let i = 0; i < 5; i += 1) {
    await db.doc(`${ORG}/members/m${i}`).set({ email: `m${i}@example.org`, emailLower: `m${i}@example.org`, status: "active", roles: ["member"], emailConsent: { source: "imported" } });
  }
  await db.doc(`${ORG}/members/out`).set({ emailLower: "out@example.org", status: "active", emailConsent: { source: "imported" }, emailOptOutAt: new Date() });
  const { hashBroadcast } = await import("../../src/lib/broadcast");
  const content = { subject: "Annual meeting", body: "Join us on Saturday." };
  await db.doc(`${ORG}/broadcasts/b1`).set({
    ...content,
    audience: "all",
    status: "approved",
    contentHash: hashBroadcast(content),
    approvedHash: hashBroadcast(content),
    createdByUid: "bob",
    submittedByUid: "bob",
    approvedByUid: "carol",
    updatedAt: new Date()
  });
});

test("an approved broadcast is sent in chunks to each consenting member once, with a working personal unsubscribe link", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts/b1");
  await expect(page.getByText("Ready to send to 5 members.")).toBeVisible();

  await page.getByRole("button", { name: "Send to 5 members" }).click();
  await page.getByRole("button", { name: "Yes, send it now" }).click();
  await expect(page.getByTestId("send-progress")).toContainText("5 sent · 0 skipped · 0 failed · 0 to go (of 5)");
  await expect(page.locator('[data-slot="badge"]', { hasText: "Sent" })).toBeVisible();

  // BROADCAST_CHUNK_SIZE=2 in the test config: three requests, each with its own idempotency key.
  expect(batches.map(batch => batch.body.length)).toEqual([2, 2, 1]);
  expect(new Set(batches.map(batch => batch.key)).size).toBe(3);
  const recipients = batches.flatMap(batch => batch.body.map(message => message.to[0])).sort();
  expect(recipients).toEqual(["m0@example.org", "m1@example.org", "m2@example.org", "m3@example.org", "m4@example.org"]);

  const message = batches.flatMap(batch => batch.body).find(m => m.to[0] === "m2@example.org")!;
  expect(message.subject).toBe("Annual meeting");
  expect(message.text).toContain("Join us on Saturday.");
  expect(message.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  const link = /(http\S+\/unsubscribe\?token=\S+)/.exec(message.text)![1];

  const broadcast = (await admin().db.doc(`${ORG}/broadcasts/b1`).get()).data();
  expect(broadcast).toMatchObject({ status: "sent", total: 5, sentCount: 5 });
  const audit = (await admin().db.collection(`${ORG}/auditLogs`).get()).docs.map(doc => doc.data().action);
  expect(audit).toEqual(expect.arrayContaining(["broadcast_sending_started", "broadcast_sent"]));

  // The personal link in the email works.
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.getByRole("status")).toContainText("You're unsubscribed");
  expect((await admin().db.doc(`${ORG}/members/m2`).get()).data()?.emailOptOutAt).toBeTruthy();
});

test("sending pauses when the page closes and another visit resumes without resending", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts/b1");
  // Start through the API and send only the first chunk, as if the page closed right after.
  const first = await page.evaluate(async () => {
    const post = (step: string) => fetch("/api/admin/broadcasts/b1/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) }).then(r => r.json());
    await post("start");
    return post("chunk");
  });
  expect(first.progress).toMatchObject({ sent: 2, remaining: 3 });

  await page.reload();
  await expect(page.getByTestId("send-progress")).toContainText("2 sent");
  await page.getByRole("button", { name: "Resume sending" }).click();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Sent" })).toBeVisible();
  const recipients = batches.flatMap(batch => batch.body.map(message => message.to[0]));
  expect(recipients).toHaveLength(5);
  expect(new Set(recipients).size).toBe(5);

  // A second start is refused (one per admin per hour, and the broadcast is no longer "approved").
  const again = await page.evaluate(() =>
    fetch("/api/admin/broadcasts/b1/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "start" }) }).then(r => r.status)
  );
  expect([409, 429]).toContain(again);
});

test("a broadcast that is not approved cannot be sent", async ({ page }) => {
  await admin().db.doc(`${ORG}/broadcasts/b1`).update({ status: "pending_approval" });
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts/b1");
  await expect(page.getByRole("button", { name: /^Send to/ })).toHaveCount(0);
  const status = await page.evaluate(() =>
    fetch("/api/admin/broadcasts/b1/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "start" }) }).then(r => r.status)
  );
  expect(status).toBe(409);
  expect(batches).toHaveLength(0);
});
