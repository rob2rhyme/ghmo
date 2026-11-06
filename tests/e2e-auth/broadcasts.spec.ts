import { createServer, type Server } from "node:http";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

type Mail = { body: { to: string[]; subject: string; text: string } };
const mails: Mail[] = [];
let stub: Server;

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      mails.push({ body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"stub"}');
    });
  }).listen(4010, "127.0.0.1");
  await new Promise(resolve => stub.once("listening", resolve));
});
test.afterAll(() => new Promise(resolve => stub.close(() => resolve(undefined))));

const broadcasts = () => admin().db.collection("organizations/ghmo/broadcasts");
const members = () => admin().db.collection("organizations/ghmo/members");
const auditActions = async () => (await admin().db.collection("organizations/ghmo/auditLogs").get()).docs.map(doc => doc.data().action);

test.beforeEach(async () => {
  mails.length = 0;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await admin().db.doc("organizations/ghmo/admins/alice").update({ email: "alice@example.org" });
  await admin().db.doc("organizations/ghmo/admins/bob").update({ email: "bob@example.org" });
  const base = { status: "active", roles: ["member"] };
  await members().doc("m1").set({ ...base, emailLower: "sam@example.org", emailConsent: { source: "imported" } });
  await members().doc("m2").set({ ...base, emailLower: "pat@example.org", emailConsent: { source: "imported" }, emailOptOutAt: new Date() });
  await members().doc("m3").set({ ...base, emailLower: "lee@example.org" });
});

async function second(browser: Browser, uid: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInWithNewPasskey(page, uid, "/admin/broadcasts");
  return page;
}

async function startDraft(page: Page) {
  await page.getByLabel("Subject").fill("Annual meeting");
  await page.getByLabel("Message").fill("Join us on Saturday at 10am.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/broadcasts\/[A-Za-z0-9]+$/);
  return page.url().split("/").pop() as string;
}

test("a second admin must approve; the writer cannot; editing after approval resets it", async ({ page, browser }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const id = await startDraft(page);
  // Only the one member who agreed and has not opted out would receive it.
  await expect(page.getByText("Would go to 1 member")).toBeVisible();

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve this message" })).toHaveCount(0);
  await expect(page.getByText("so you can't approve it")).toBeVisible();

  // The API refuses the writer too, not just the button.
  const own = await page.evaluate(async broadcastId => {
    const stored = await fetch(`/api/admin/broadcasts/${broadcastId}`).then(r => r.json());
    const res = await fetch(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", contentHash: stored.broadcast.contentHash })
    });
    return { status: res.status, body: await res.json() };
  }, id);
  expect(own.status).toBe(403);
  expect(own.body.code).toBe("SEPARATION_OF_DUTIES");

  const bob = await second(browser, "bob");
  await bob.goto(`/admin/broadcasts/${id}`);
  await expect(bob.getByText("Join us on Saturday at 10am.").first()).toBeVisible();
  await bob.getByRole("button", { name: "Approve this message" }).click();
  await expect(bob.locator('[data-slot="badge"]', { hasText: "Approved" })).toBeVisible();
  expect((await broadcasts().doc(id).get()).data()).toMatchObject({ status: "approved", approvedByUid: "bob" });

  // Alice withdraws, edits, and the approval is gone.
  await page.reload();
  await page.getByRole("button", { name: "Withdraw to edit" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByLabel("Message").fill("Join us on Sunday at 10am.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(async () => (await broadcasts().doc(id).get()).data()?.body).toBe("Join us on Sunday at 10am.");
  const stored = (await broadcasts().doc(id).get()).data();
  expect(stored).toMatchObject({ status: "draft", approvedByUid: null, approvedHash: null });

  // The route writes the audit entry just after the record, so wait for it rather than racing it.
  await expect.poll(auditActions).toEqual(expect.arrayContaining(["broadcast_created", "broadcast_submitted", "broadcast_approved", "broadcast_withdrawn", "broadcast_updated"]));
  // The audit log holds status and fingerprints, not the message.
  const audit = (await admin().db.collection("organizations/ghmo/auditLogs").get()).docs.map(doc => JSON.stringify(doc.data())).join("\n");
  expect(audit).not.toContain("Join us on");
});

test("approving a message that changed since it was opened is refused", async ({ page, browser }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const id = await startDraft(page);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval")).toBeVisible();

  const bob = await second(browser, "bob");
  await bob.goto(`/admin/broadcasts/${id}`);
  const status = await bob.evaluate(async broadcastId => {
    const res = await fetch(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", contentHash: "0".repeat(64) })
    });
    return res.status;
  }, id);
  expect(status).toBe(409);
  expect((await broadcasts().doc(id).get()).data()?.status).toBe("pending_approval");
});

test("a test email goes only to the signed-in admin, marked TEST, with the footer and a dead preview link", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  await startDraft(page);
  await expect(page.getByTestId("footer-preview")).toContainText("Test Org");

  await page.getByRole("button", { name: "Send a test to me" }).click();
  await expect.poll(() => mails.length).toBe(1);
  const { body } = mails[0];
  expect(body.to).toEqual(["alice@example.org"]);
  expect(body.subject).toBe("[TEST] Annual meeting");
  expect(body.text).toContain("THIS IS A TEST");
  expect(body.text).toContain("Join us on Saturday at 10am.");
  expect(body.text).toContain("Test Org");
  expect(body.text).toContain("1 Main Street, Springfield");
  expect(body.text).toContain("/unsubscribe?token=preview");
  await expect.poll(auditActions).toContain("broadcast_test_sent");
});

test("a cancelled broadcast cannot be edited, submitted or tested; the API refuses bad content", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const id = await startDraft(page);
  await page.getByRole("button", { name: "Cancel broadcast…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel broadcast" }).click();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Canceled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for approval" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send a test to me" })).toHaveCount(0);

  const results = await page.evaluate(async broadcastId => {
    const patch = (body: unknown) =>
      fetch(`/api/admin/broadcasts/${broadcastId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.status);
    const post = (body: unknown) =>
      fetch("/api/admin/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.status);
    return {
      edit: await patch({ subject: "x", body: "y" }),
      both: await patch({ subject: "x", body: "y", action: "submit" }),
      emptySubject: await post({ subject: " ", body: "y" }),
      emptyBody: await post({ subject: "x", body: "" }),
      test: await fetch(`/api/admin/broadcasts/${broadcastId}/test`, { method: "POST" }).then(r => r.status),
      missing: await patch({ action: "cancel" }).then(() => fetch("/api/admin/broadcasts/nope", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).then(r => r.status))
    };
  }, id);
  expect(results).toEqual({ edit: 409, both: 400, emptySubject: 400, emptyBody: 400, test: 409, missing: 404 });
  expect(mails).toHaveLength(0);
});

test("an approved message can be copied for the Messenger group chats and each hand post is recorded (plan §12, 9-D)", async ({ page, browser }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const id = await startDraft(page);

  // A draft has no Messenger card, and the API refuses to record a post for it.
  await expect(page.getByText("Post to the Messenger group chats")).toHaveCount(0);
  const early = await page.evaluate(async broadcastId => {
    const stored = await fetch(`/api/admin/broadcasts/${broadcastId}`).then(r => r.json());
    const res = await fetch(`/api/admin/broadcasts/${broadcastId}/manual-post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "messenger_bod", contentHash: stored.broadcast.contentHash })
    });
    return res.status;
  }, id);
  expect(early).toBe(400);

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval")).toBeVisible();
  const bob = await second(browser, "bob");
  await bob.goto(`/admin/broadcasts/${id}`);
  await waitForStreamedContent(bob);
  await bob.getByRole("button", { name: "Approve this message" }).click();
  await expect(bob.locator('[data-slot="badge"]', { hasText: "Approved" })).toBeVisible();

  // Alice copies the approved text (no email footer) and records where she pasted it.
  await page.reload();
  // Wait for React to move streamed parts into place, or the card title briefly exists twice (seen in CI).
  await waitForStreamedContent(page);
  await expect(page.getByText("Post to the Messenger group chats")).toBeVisible();
  await expect(page.getByLabel("Text for Messenger")).toHaveValue("Annual meeting\n\nJoin us on Saturday at 10am.");
  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByText("Copied. Paste it into the group chat.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Annual meeting\n\nJoin us on Saturday at 10am.");
  await page.getByRole("button", { name: "I posted it in the BOD group chat" }).click();
  await expect(page.getByRole("list", { name: "Posted to group chats" })).toContainText("Alice posted it in the BOD group chat");
  await page.getByRole("button", { name: "I posted it in the Community group chat" }).click();
  await expect(page.getByRole("list", { name: "Posted to group chats" }).getByRole("listitem")).toHaveCount(2);

  const stored = (await broadcasts().doc(id).get()).data()!;
  expect(stored.status).toBe("approved");
  expect(stored.manualPosts.map((p: { channel: string; byUid: string }) => [p.channel, p.byUid])).toEqual([
    ["messenger_bod", "alice"],
    ["messenger_community", "alice"]
  ]);
  // Nothing was emailed: posting by hand is separate from sending.
  expect(mails).toHaveLength(0);
  await expect.poll(async () => (await admin().db.collection("organizations/ghmo/auditLogs").where("action", "==", "broadcast_posted_manually").get()).size).toBe(2);
  const audit = (await admin().db.collection("organizations/ghmo/auditLogs").where("action", "==", "broadcast_posted_manually").get()).docs.map(d => d.data());
  expect(audit[0].after.contentHash).toBe(stored.approvedHash);
  expect(JSON.stringify(audit)).not.toContain("Join us on");

  // A stale copy (text fingerprint that is not the approved one) is refused.
  const stale = await page.evaluate(async broadcastId => {
    const res = await fetch(`/api/admin/broadcasts/${broadcastId}/manual-post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "messenger_bod", contentHash: "0".repeat(64) })
    });
    return res.status;
  }, id);
  expect(stale).toBe(409);
});
