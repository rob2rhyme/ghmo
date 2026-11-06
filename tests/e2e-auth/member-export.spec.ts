import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/**
 * The member list export: a CSV built in the browser from the list and, when asked, the phone numbers this device has
 * decrypted; every download is recorded first, with counts and choices only; spreadsheet formulas are neutralised.
 */
const ORG = "organizations/ghmo";
const shown = (page: Page, text: string) => page.locator("#admin-main").getByText(text, { exact: true }).filter({ visible: true });

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("dialog").getByRole("button", { name: button }).click()]);
  expect(file.suggestedFilename()).toMatch(/^ghmo-members-\d{4}-\d{2}-\d{2}\.csv$/);
  return readFileSync((await file.path()) as string, "utf8");
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("exports the list with or without phone numbers, only what is shown, and records each download", async ({ page }) => {
  test.setTimeout(240_000);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  await expect(shown(page, "No members yet")).toBeVisible();

  // Two members: Sam with a number, and one whose name would run as a spreadsheet formula.
  await page.getByLabel("Email", { exact: true }).fill("sam@example.org");
  await page.getByLabel("Name", { exact: true }).fill("Sam Lee");
  await page.locator("#member-phone").fill("(717) 555-0100");
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "Can be called")).toBeVisible();
  // The Add form stays open after a save on an empty list; open it only if it has closed.
  if (!(await page.locator("#member-email").isVisible())) await page.getByRole("button", { name: "Add a member" }).click();
  await page.getByLabel("Email", { exact: true }).fill("evil@example.org");
  await page.getByLabel("Name", { exact: true }).fill("=1+1");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("evil@example.org").first()).toBeVisible();

  // --- Everyone, no numbers (the default) ---
  await page.getByRole("button", { name: "Export list" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Export the member list" })).toBeVisible();
  await expect(dialog.getByLabel("Include phone numbers, alternate numbers, language and household")).not.toBeChecked();
  const plain = await download(page, "Download 2 members");
  expect(plain.startsWith("﻿Name,Email,Status,Member since,City,State,Groups,Officer positions,Email status,Call status\r\n")).toBe(true);
  expect(plain).toContain("Sam Lee,sam@example.org,Active");
  expect(plain).toContain("'=1+1,evil@example.org,Active"); // the formula is made plain text
  expect(plain).not.toMatch(/555|0100/);
  await expect(dialog).toHaveCount(0);

  // --- Everyone, with numbers: decrypted in this browser, written readable ---
  await page.getByRole("button", { name: "Export list" }).click();
  await dialog.getByLabel("Include phone numbers, alternate numbers, language and household").check();
  const withPhones = await download(page, "Download 2 members");
  expect(withPhones).toContain("Name,Email,Phone,Alternate phone,Language,Household,Status");
  expect(withPhones).toContain("Sam Lee,sam@example.org,(717) 555-0100,,,,Active");

  // --- Only what is shown ---
  await page.getByLabel("Search members").fill("sam");
  await expect(page.getByText("evil@example.org")).toHaveCount(0);
  await page.getByRole("button", { name: "Export list" }).click();
  await expect(dialog.getByLabel("Only the 1 shown with the current search and filters")).toBeChecked();
  const onlyShown = await download(page, "Download 1 member");
  expect(onlyShown).toContain("Sam Lee");
  expect(onlyShown).not.toContain("evil@example.org");

  // --- Each download is in the activity log, with counts and choices only ---
  const logged = await admin().db.collection(`${ORG}/auditLogs`).where("action", "==", "members_exported").get();
  expect(logged.size).toBe(3);
  const entries = logged.docs.map(doc => doc.data()).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  expect(entries.map(entry => entry.after)).toEqual([
    { count: 2, scope: "all", includesPhones: false },
    { count: 2, scope: "all", includesPhones: true },
    { count: 1, scope: "shown", includesPhones: false }
  ]);
  const json = plainJson(entries);
  expect(json).not.toMatch(/Sam|evil|555|0100/);
  expect(entries[1].actor).toMatchObject({ uid: "alice" });
});
