import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

type Mail = { authorization?: string; body: { from: string; to: string[]; subject: string; text: string } };
const mails: Mail[] = [];
let stub: Server;

test.beforeAll(async () => {
  stub = createServer((req, res) => {
    let raw = "";
    req.on("data", chunk => (raw += chunk));
    req.on("end", () => {
      mails.push({ authorization: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"stub"}');
    });
  }).listen(4010, "127.0.0.1");
  await new Promise(resolve => stub.once("listening", resolve));
});
test.afterAll(() => new Promise(resolve => stub.close(() => resolve(undefined))));

test.beforeEach(async () => {
  mails.length = 0;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["admin"]);
  const { db } = admin();
  await db.doc("organizations/ghmo/admins/alice").update({ email: "alice@example.org" });
  await db.doc("organizations/ghmo/admins/bob").update({ email: "bob@example.org", notifyEmail: true });
  await db.doc("organizations/ghmo/admins/carol").update({ email: "carol@example.org" }); // has not opted in
});

test("opted-in admins get one content-free email per half hour; nobody else does", async ({ page }) => {
  const SECRET = "Quietly buy the old hall on Friday";
  await signInWithNewPasskey(page, "alice", "/admin/chat");
  const box = page.getByPlaceholder("Share an update or ask for help...");
  const bubble = page.locator("p", { hasText: SECRET });

  await box.fill(SECRET);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bubble).toBeVisible();
  await expect.poll(() => mails.length, { timeout: 15_000 }).toBe(1);

  const { body, authorization } = mails[0];
  expect(authorization).toBe("Bearer test-key");
  expect(body.to).toEqual(["bob@example.org"]);
  expect(body.subject).toBe("GHMO: New activity in Admin chat");
  expect(JSON.stringify(body)).not.toMatch(/old hall|Friday|Alice/);
  expect(body.text).toContain("/admin/chat");

  // A second message inside the window sends nothing more.
  await box.fill("Another one");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("p", { hasText: "Another one" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(mails).toHaveLength(1);
});

test("an admin can turn email notifications on and off from Security", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/security");
  await page.getByRole("button", { name: "Turn on email notifications" }).click();
  await expect.poll(async () => (await admin().db.doc("organizations/ghmo/admins/alice").get()).data()?.notifyEmail).toBe(true);
  await page.getByRole("button", { name: "Turn off email notifications" }).click();
  await expect.poll(async () => (await admin().db.doc("organizations/ghmo/admins/alice").get()).data()?.notifyEmail).toBe(false);
});
