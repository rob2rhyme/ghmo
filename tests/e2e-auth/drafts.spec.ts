import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const TITLE = "Hall purchase plan";
const BODY = "Offer eighty thousand before March";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  const event = { title: "Spring board meeting", body: "x", status: "published", startsAt: Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000) };
  await admin().db.doc("organizations/ghmo-site/events/ev1").set(event);
});

const draftKeys = (page: Page) => page.evaluate(() => Object.keys(window.localStorage).filter(key => key.startsWith("ghmo-draft:")));
const draftDump = (page: Page) =>
  page.evaluate(() =>
    Object.keys(window.localStorage)
      .filter(key => key.startsWith("ghmo-draft:"))
      .map(key => window.localStorage.getItem(key))
      .join("\n")
  );

test("nothing is saved locally until encryption is on and the device is unlocked", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/comms");
  await page.getByPlaceholder("e.g., Approve community outreach plan").fill(TITLE);
  await page.getByPlaceholder("Summarize the plan, proposal, or issue.").fill(BODY);
  await page.waitForTimeout(2000);
  expect(await draftKeys(page)).toEqual([]);
});

test("unsent drafts are kept encrypted on this device, offered after a reload, and cleared once sent", async ({ page }) => {
  test.setTimeout(180_000);
  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Plans & Issues" }).click();

  // --- A new topic draft ---
  await page.getByPlaceholder("e.g., Approve community outreach plan").fill(TITLE);
  await page.getByPlaceholder("Summarize the plan, proposal, or issue.").fill(BODY);
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
  const stored = await draftDump(page);
  expect(stored).not.toContain("Hall purchase");
  expect(stored).not.toContain("eighty");

  await page.reload();
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(page.getByText(/You have an unsaved draft/)).toBeVisible();
  await page.getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByPlaceholder("e.g., Approve community outreach plan")).toHaveValue(TITLE);
  await expect(page.getByPlaceholder("Summarize the plan, proposal, or issue.")).toHaveValue(BODY);

  // Starting the topic clears the draft.
  await page.getByRole("button", { name: "Start topic" }).click();
  await expect(page.getByText("Topic started.")).toBeVisible();
  await expect.poll(() => draftKeys(page)).toEqual([]);

  // --- A minutes draft; discarding removes it ---
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Meeting minutes" }).click();
  await page.getByPlaceholder("Summarize the discussion").fill("Discussed the diocese offer");
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
  expect(await draftDump(page)).not.toContain("diocese");
  await page.reload();
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(page.getByText(/You have an unsaved draft/)).toBeVisible();
  await page.getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByPlaceholder("Summarize the discussion")).toHaveValue("Discussed the diocese offer");

  // Reload without restoring, then discard.
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText(/You have an unsaved draft/)).toHaveCount(0);
  expect(await draftKeys(page)).toEqual([]);

  // --- Signing out removes drafts from the browser ---
  await page.getByPlaceholder("Summarize the discussion").fill("Another unsent note");
  await expect.poll(() => draftKeys(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/");
  expect(await draftKeys(page)).toEqual([]);

  expect(violations).toEqual([]);
});
