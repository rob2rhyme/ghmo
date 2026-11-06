import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/** 16-B: the super-admin push controls on the Security page, and the notice every admin sees when push is off for the site. */
const ORG = "organizations/ghmo";
const { db } = admin();
const BOB_DEVICE = "b".repeat(32);
const CAROL_DEVICE = "c".repeat(32);

async function seedDevice(id: string, uid: string, kinds: string[]) {
  await db.doc(`${ORG}/pushSubscriptions/${id}`).set({
    uid,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: "B" + "a".repeat(86),
    auth: "a".repeat(22),
    label: "Chrome on Android",
    kinds,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    lastSentAt: null
  });
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["admin"]);
  await db.doc(`${ORG}/admins/carol`).update({ status: "disabled" });
  await seedDevice(BOB_DEVICE, "bob", ["chat", "calls"]);
  await seedDevice(CAROL_DEVICE, "carol", ["chat"]);
});

test("a plain admin sees no super-admin push cards, and sees the notice when push is off for the site", async ({ page }) => {
  await db.doc(`${ORG}/pushSettings/settings`).set({ enabled: false, updatedBy: "alice", updatedAt: new Date() });
  await signInWithNewPasskey(page, "bob", "/admin/security");
  await expect(page.getByRole("heading", { name: /Push notifications on this device/ })).toBeVisible();
  await expect(page.getByText(/turned off for the whole site by a super admin/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Push for the whole site/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Everyone's push devices" })).toHaveCount(0);
});

test("a super admin switches push off and on for the site, and turns a device off", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/security");
  await waitForStreamedContent(page);

  // --- The site switch ---
  const site = page.getByRole("heading", { name: /Push for the whole site/ });
  await expect(site).toBeVisible();
  await expect(site).toContainText("On");
  await page.getByRole("button", { name: "Turn push off…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Turn push off for everyone?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Turn push off" }).click();
  await expect(site).toContainText("Off");
  await expect(page.getByText(/Last changed by Alice on /)).toBeVisible();
  expect((await db.doc(`${ORG}/pushSettings/settings`).get()).get("enabled")).toBe(false);
  await page.getByRole("button", { name: "Turn push on" }).click();
  await expect(site).toContainText("On");
  expect((await db.doc(`${ORG}/pushSettings/settings`).get()).get("enabled")).toBe(true);

  // --- Everyone's devices ---
  const cards = page.getByTestId("all-push-device");
  await expect(page.getByRole("heading", { name: "Everyone's push devices" })).toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Bob");
  await expect(cards.nth(0)).toContainText("New activity in Admin chat");
  await expect(cards.nth(0)).toContainText("You have calls to make");
  await expect(cards.nth(1)).toContainText("Carol");
  await expect(cards.nth(1)).toContainText("Account turned off");
  await expect(page.locator("body")).not.toContainText("fcm.googleapis.com");

  // Turn off the turned-off admin's device (a lost phone is cleared before its owner is turned back on).
  await page.getByRole("button", { name: "Turn off Chrome on Android for Carol" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Turn off Chrome on Android for Carol?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Turn off device" }).click();
  await expect(cards).toHaveCount(1);
  expect((await db.doc(`${ORG}/pushSubscriptions/${CAROL_DEVICE}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/pushSubscriptions/${BOB_DEVICE}`).get()).exists).toBe(true);
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "push_device_removed").get()).size).toBe(1);
});
