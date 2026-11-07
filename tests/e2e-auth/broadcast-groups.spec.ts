import { createServer, type Server } from "node:http";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Plan §30, 23-B: a broadcast can go to one group (D91). The approver sees who it goes to and how many
 * (D92); changing the group after approval needs approval again; group emails say why the person got
 * them (D93); turned-off groups are not offered.
 */
type Batch = { body: { to: string[]; subject: string; text: string }[] };
const batches: Batch[] = [];
let stub: Server;

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw);
      if (req.url?.endsWith("/batch")) {
        batches.push({ body });
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
const broadcasts = () => admin().db.collection(`${ORG}/broadcasts`);

test.beforeEach(async () => {
  batches.length = 0;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const { db } = admin();
  const group = { description: "", leadMemberId: null, kind: null, builtIn: false, createdAt: new Date(), updatedAt: new Date() };
  await db.doc(`${ORG}/groups/cooking`).set({ ...group, name: "Cooking team", active: true });
  await db.doc(`${ORG}/groups/old`).set({ ...group, name: "Old crew", active: false });
  const ready = { status: "active", roles: ["member"], emailConsent: { source: "imported" } };
  await db.doc(`${ORG}/members/c1`).set({ ...ready, email: "cook@example.org", emailLower: "cook@example.org", groupIds: ["cooking"] });
  await db.doc(`${ORG}/members/c2`).set({ ...ready, emailLower: "quiet@example.org", groupIds: ["cooking"], emailOptOutAt: new Date() });
  await db.doc(`${ORG}/members/c3`).set({ ...ready, email: "other@example.org", emailLower: "other@example.org" });
  await db.doc(`${ORG}/members/c4`).set({ ...ready, email: "old@example.org", emailLower: "old@example.org", groupIds: ["old"] });
});

async function second(browser: Browser, uid: string, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signInWithNewPasskey(page, uid, path);
  return page;
}

test("a group broadcast is approved with its audience shown and goes only to that group's members who can be emailed", async ({ page, browser }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const sendTo = page.getByLabel("Send to");
  // Everyone counts the three who can be emailed; the turned-off group is not offered.
  await expect(sendTo.locator("option", { hasText: "Everyone who agreed to email (3 members)" })).toHaveCount(1);
  await expect(sendTo.locator("option", { hasText: "Cooking team (1 member)" })).toHaveCount(1);
  await expect(sendTo.locator("option", { hasText: "Old crew" })).toHaveCount(0);

  await page.getByLabel("Subject").fill("Cooking shifts");
  await page.getByLabel("Message").fill("Please sign up for Saturday.");
  await sendTo.selectOption({ label: "Cooking team (1 member)" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/broadcasts\/[A-Za-z0-9]+$/);
  const id = page.url().split("/").pop() as string;
  await expect(page.getByTestId("audience-line")).toHaveText("To: Cooking team (1 member)");
  await expect(page.getByTestId("footer-preview")).toContainText("You got this because you are in this group: Cooking team.");
  expect((await broadcasts().doc(id).get()).data()).toMatchObject({ audience: "group", audienceGroupId: "cooking", audienceGroupName: "Cooking team" });
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval")).toBeVisible();

  // The approver sees who it goes to, and how many.
  const bob = await second(browser, "bob", `/admin/broadcasts/${id}`);
  await expect(bob.getByTestId("audience-line")).toHaveText("To: Cooking team (1 member)");
  await expect(bob.getByText("going to Cooking team (1 member)")).toBeVisible();
  await bob.getByRole("button", { name: "Approve this message" }).click();
  await expect(bob.locator('[data-slot="badge"]', { hasText: "Approved" })).toBeVisible();

  await bob.getByRole("button", { name: "Send to 1 member" }).click();
  await bob.getByRole("dialog").getByRole("button", { name: "Yes, send it now" }).click();
  await expect(bob.locator('[data-slot="badge"]', { hasText: "Sent" })).toBeVisible();
  const sent = batches.flatMap(batch => batch.body);
  expect(sent.map(message => message.to[0])).toEqual(["cook@example.org"]);
  expect(sent[0].text).toContain("You got this because you are in this group: Cooking team.");
  expect(sent[0].text).toContain("/unsubscribe?token=");

  // The activity log names the group.
  await expect
    .poll(async () => (await admin().db.collection(`${ORG}/auditLogs`).where("action", "==", "broadcast_sending_started").get()).docs.map(doc => doc.data().resource?.summary))
    .toEqual(["To: Cooking team"]);
  const created = (await admin().db.collection(`${ORG}/auditLogs`).where("action", "==", "broadcast_created").get()).docs[0]?.data();
  expect(created?.after).toMatchObject({ audience: "group", audienceGroupId: "cooking", audienceGroupName: "Cooking team" });
});

test("changing who it goes to after approval returns it to draft", async ({ page }) => {
  const { hashBroadcast } = await import("../../src/lib/broadcastHash");
  const content = { subject: "Cooking shifts", body: "Please sign up for Saturday." };
  const hash = hashBroadcast({ ...content, audience: { kind: "group", groupId: "cooking" } });
  await broadcasts()
    .doc("g1")
    .set({ ...content, audience: "group", audienceGroupId: "cooking", audienceGroupName: "Cooking team", status: "approved", contentHash: hash, submittedHash: hash, approvedHash: hash, createdByUid: "bob", submittedByUid: "bob", approvedByUid: "carol", updatedAt: new Date() });
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts/g1");
  await expect(page.getByTestId("audience-line")).toHaveText("To: Cooking team (1 member)");

  // Widening to everyone through the API (no withdraw first) drops the approval.
  const widened = await page.evaluate(async () => {
    const res = await fetch("/api/admin/broadcasts/g1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "Cooking shifts", body: "Please sign up for Saturday.", audience: "all", audienceGroupId: null })
    });
    return { status: res.status, body: await res.json() };
  });
  expect(widened.status).toBe(200);
  expect(widened.body.recipientCount).toBe(3);
  expect((await broadcasts().doc("g1").get()).data()).toMatchObject({ status: "draft", audience: "all", approvedHash: null, approvedByUid: null });

  // In the page: back to the group, with the count before saving.
  await page.reload();
  await expect(page.getByTestId("audience-line")).toHaveText("To: Everyone who agreed to email");
  await page.getByLabel("Send to").selectOption({ label: "Cooking team (1 member)" });
  await expect(page.getByText("After saving, it would go to 1 member.")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("audience-line")).toHaveText("To: Cooking team (1 member)");
  expect((await broadcasts().doc("g1").get()).data()).toMatchObject({ status: "draft", audience: "group", audienceGroupId: "cooking", contentHash: hash });
});

test("a turned-off group can't be chosen, submitted or sent to", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");
  const refused = await page.evaluate(async () => {
    const res = await fetch("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "Hi", body: "Hello", audience: "group", audienceGroupId: "old" })
    });
    return { status: res.status, body: await res.json() };
  });
  expect(refused).toMatchObject({ status: 400, body: { code: "GROUP_OFF" } });
  const missing = await page.evaluate(() =>
    fetch("/api/admin/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "Hi", body: "Hello", audience: "group" }) }).then(r => r.status)
  );
  expect(missing).toBe(400);

  // A draft whose group is turned off afterwards: warned, and submitting is refused.
  await page.getByLabel("Subject").fill("Cooking shifts");
  await page.getByLabel("Message").fill("Please sign up for Saturday.");
  await page.getByLabel("Send to").selectOption({ label: "Cooking team (1 member)" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/admin\/broadcasts\/[A-Za-z0-9]+$/);
  const id = page.url().split("/").pop() as string;
  await admin().db.doc(`${ORG}/groups/cooking`).update({ active: false });
  await page.reload();
  await expect(page.getByText("The Cooking team group is turned off")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
  const submit = await page.evaluate(
    broadcastId => fetch(`/api/admin/broadcasts/${broadcastId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) }).then(r => r.json()),
    id
  );
  expect(submit.code).toBe("GROUP_OFF");
  expect((await broadcasts().doc(id).get()).data()?.status).toBe("draft");

  // Picking everyone fixes it.
  await page.getByLabel("Send to").selectOption({ label: "Everyone who agreed to email (3 members)" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("audience-line")).toHaveText("To: Everyone who agreed to email");
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
});
