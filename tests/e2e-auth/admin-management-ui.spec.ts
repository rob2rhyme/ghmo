import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/** 17-B: the Admins page. Super admins only: the nav link, the page and the actions; the server's guards still apply. */
const ORG = "organizations/ghmo";
const { db } = admin();
const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Admin" }).first();

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["super_admin"]);
});

test("a plain admin has no Admins link and gets not-found at the address", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/security");
  await expect(nav(page).getByRole("link", { name: "Security" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Admins" })).toHaveCount(0);
  await page.goto("/admin/admins");
  await expect(page.getByRole("heading", { name: "Everyone who can sign in" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add admin" })).toHaveCount(0);
});

test("a super admin adds an admin, turns one off and on, changes a role and fixes a name", async ({ page }) => {
  test.setTimeout(120_000);
  await db.doc(`${ORG}/pushSubscriptions/${"b".repeat(32)}`).set({ uid: "bob", endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "k", auth: "a", label: "Chrome on Android", kinds: ["chat"], createdAt: new Date(), lastSentAt: null });
  await signInWithNewPasskey(page, "alice", "/admin/security");
  await nav(page).getByRole("link", { name: "Admins" }).click();
  await page.waitForURL(/\/admin\/admins$/);
  await waitForStreamedContent(page);

  const list = page.getByRole("list", { name: "Admins" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  // You: marked, and with no way to turn yourself off or change your own role.
  const you = list.getByRole("listitem").filter({ hasText: "Alice" });
  await expect(you.getByText("You", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn off Alice" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Make Alice/ })).toHaveCount(0);

  // --- Add ---
  await page.getByLabel("Name", { exact: true }).fill("Deepak Gurung");
  await page.getByLabel("Email", { exact: true }).fill("Deepak@Example.org");
  await page.getByRole("button", { name: "Add admin" }).click();
  await expect(page.getByText("Deepak Gurung can now sign in")).toBeVisible();
  await expect(page.getByText(/enter deepak@example\.org/)).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  expect((await db.collection(`${ORG}/admins`).where("emailLower", "==", "deepak@example.org").get()).docs[0].get("status")).toBe("active");
  // The same address again shows the server's message.
  await page.getByLabel("Name", { exact: true }).fill("Deepak Again");
  await page.getByLabel("Email", { exact: true }).fill("deepak@example.org");
  await page.getByRole("button", { name: "Add admin" }).click();
  await expect(page.getByText(/already an admin with that email address/).first()).toBeVisible();

  // --- Turn off (with the push devices), then the encryption reminder ---
  await page.getByRole("button", { name: "Turn off Bob" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Turn off Bob?" })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Also turn off their push notification devices/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByText("Bob is turned off", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin → Encryption" })).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Bob" }).getByText("Turned off", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/admins/bob`).get()).get("status")).toBe("disabled");
  expect((await db.doc(`${ORG}/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(false);

  // --- Turn on ---
  await page.getByRole("button", { name: "Turn on Bob" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Bob" }).getByText("Active", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/admins/bob`).get()).get("status")).toBe("active");

  // --- Role ---
  await page.getByRole("button", { name: "Make Bob a super admin" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Make Bob a super admin?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Make super admin" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Bob" }).getByText("Super admin", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/admins/bob`).get()).get("roles")).toEqual(["super_admin"]);

  // --- Fix a name ---
  await page.getByRole("button", { name: "Fix the name of Bob" }).click();
  const rename = page.getByRole("dialog");
  await rename.getByLabel("Name").fill("Bob Rai");
  await rename.getByRole("button", { name: "Save name" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Bob Rai" })).toBeVisible();
  expect((await db.doc(`${ORG}/admins/bob`).get()).get("name")).toBe("Bob Rai");

  // Every change is in the activity log.
  const actions = (await db.collection(`${ORG}/auditLogs`).get()).docs.map(doc => doc.get("action") as string);
  for (const action of ["admin_added", "admin_turned_off", "admin_turned_on", "admin_role_changed", "admin_renamed"]) expect(actions, action).toContain(action);
});
