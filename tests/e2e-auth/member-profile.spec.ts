import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent, memberAction } from "./helpers";

/**
 * Phase 13-A (plan §17): a profile page per member. Member since, city and state are plain facts any admin can set;
 * family members (with optional phone numbers) are encrypted in the browser, masked until shown, and survive an
 * Edit contact save on the Members page.
 */

const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name, exact: true });

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("member since, city and state: saved, shown with how long, cleaned up, and checked on the server", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  await db.doc(`${ORG}/members/m1`).set({ name: "Mongal Puwart", email: "mongal@example.org", emailLower: "mongal@example.org", status: "active", roles: ["member"], createdAt: new Date("2025-06-10T12:00:00Z") });
  await db.doc(`${ORG}/members/m2`).set({ name: "Hari Rai", email: "hari@example.org", emailLower: "hari@example.org", status: "active", roles: ["member"] });
  await signInWithNewPasskey(page, "bob", "/admin/members");
  await waitForStreamedContent(page);

  await page.getByRole("link", { name: "Profile of Mongal Puwart" }).click();
  await expect(main(page).getByRole("heading", { name: "Mongal Puwart", level: 1 }).or(page.getByRole("heading", { name: "Mongal Puwart", level: 1 }))).toBeVisible();
  await expect(page.getByTestId("member-since-line")).toHaveText("No member-since date yet.");
  await expect(page.getByText(/Added to the list on Jun 10, 2025/)).toBeVisible();

  // A date in the future is refused in plain words and can't be saved.
  await page.getByLabel("Member since").fill("2999-01-01");
  await expect(page.getByText("A member can't have joined in the future.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await page.getByLabel("Member since").fill("2019-03-18");
  await page.getByLabel("City", { exact: true }).fill("  Harrisburg ");
  await page.getByLabel("State", { exact: true }).fill("pennsylvania");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page.getByTestId("member-since-line")).toContainText("Member since Mar 2019 · ");
  await expect(page.getByTestId("member-since-line")).toContainText(/\d+ years?/);
  await expect(page.getByTestId("member-since-line")).toContainText("Harrisburg, PA");
  expect((await db.doc(`${ORG}/members/m1`).get()).data()).toMatchObject({ memberSince: "2019-03-18", city: "Harrisburg", state: "PA", name: "Mongal Puwart" });

  // The list shows and searches the place; the activity log keeps before and after.
  await page.getByRole("link", { name: "Members", exact: true }).first().click();
  const row = main(page).getByRole("listitem").filter({ hasText: "Mongal Puwart" });
  await expect(row.getByText(/Harrisburg, PA/)).toBeVisible();
  await page.getByRole("textbox", { name: "Search members" }).fill("harrisburg");
  await expect(main(page).getByRole("listitem").filter({ hasText: "Hari Rai" })).toHaveCount(0);
  await expect(row).toBeVisible();
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_updated").get()).docs.map(d => d.data());
  expect(audit).toHaveLength(1);
  expect(audit[0].after).toMatchObject({ memberSince: "2019-03-18", city: "Harrisburg", state: "PA" });

  // The server checks the date too, and a blank clears a field.
  const bad = await page.request.patch("/api/organizations/ghmo/members/m1", { data: { memberSince: "2999-01-01" } });
  expect(bad.status()).toBe(400);
  expect((await page.request.patch("/api/organizations/ghmo/members/m1", { data: { memberSince: "2019-02-30" } })).status()).toBe(400);
  expect((await page.request.patch("/api/organizations/ghmo/members/m1", { data: { memberSince: "1019-01-01" } })).status()).toBe(400);
  const cleared = await page.request.patch("/api/organizations/ghmo/members/m1", { data: { city: "", state: null } });
  expect(cleared.status()).toBe(200);
  expect((await db.doc(`${ORG}/members/m1`).get()).data()).toMatchObject({ city: null, state: null, memberSince: "2019-03-18" });

  // Family is encrypted, so without encryption there is nothing to add and the page says so.
  await page.goto("/admin/members/m1");
  await waitForStreamedContent(page);
  await expect(page.getByText(/Family details are kept encrypted\. Turn on encryption/)).toBeVisible();
  await page.goto("/admin/members/nope");
  await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible();
});

test("family members are ciphertext, masked until shown, validated, and kept when the contact is edited", async ({ page }) => {
  test.setTimeout(240_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await nav(page, "Members").click();
  await page.getByLabel("Email", { exact: true }).fill("sam@example.org");
  await page.getByLabel("Name", { exact: true }).fill("Sam Lee");
  await page.locator("#member-phone").fill("(717) 555-0100");
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(main(page).getByText("Sam Lee", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole("link", { name: "Profile of Sam Lee" }).click();
  const family = main(page).locator("section", { has: page.getByRole("heading", { name: "Family" }) });
  await expect(family.getByText("No family members listed")).toBeVisible();

  // A bad number is refused in plain words.
  await family.getByRole("button", { name: "Add family member" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Sita Lee");
  await dialog.getByLabel("Relationship (optional)").fill("spouse");
  await dialog.getByLabel("Phone number (optional)").fill("12345");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/The number for Sita Lee is not recognized/)).toBeVisible();
  await dialog.getByLabel("Phone number (optional)").fill("717-555-0111");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(family.getByText("Sita Lee", { exact: true })).toBeVisible();
  await expect(family.getByText("spouse", { exact: true })).toBeVisible();
  await expect(family.getByText("•••-•••-0111")).toBeVisible();
  await expect(family.getByText("(717) 555-0111")).toHaveCount(0);
  await family.getByRole("button", { name: "Show Sita Lee's number" }).click();
  await expect(family.getByText("(717) 555-0111")).toBeVisible();

  // A relative without a number, then it is all ciphertext in Firestore and nothing leaks into the log.
  await family.getByRole("button", { name: "Add family member" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Ram Lee");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(family.getByText("Ram Lee", { exact: true })).toBeVisible();
  const stored = (await db.collection(`${ORG}/members`).where("emailLower", "==", "sam@example.org").get()).docs[0];
  const raw = plainJson(stored.data());
  for (const secret of ["Sita", "Ram Lee", "spouse", "0111", "555"]) expect(raw).not.toContain(secret);
  expect(stored.get("hasPhone")).toBe(true);
  expect(JSON.stringify((await db.collection(`${ORG}/auditLogs`).get()).docs.map(d => d.data()))).not.toMatch(/Sita|0111/);

  // Editing the contact on the Members page keeps the family list.
  await page.getByRole("link", { name: "Members", exact: true }).first().click();
  await memberAction(page, "Sam Lee", /^(Edit contact|Add phone)$/);
  await page.getByRole("dialog").getByLabel("Language").fill("Nepali");
  await page.getByRole("dialog").getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact saved")).toBeVisible();
  await page.getByRole("link", { name: "Profile of Sam Lee" }).click();
  await expect(main(page).getByText("Sita Lee", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Ram Lee", { exact: true })).toBeVisible();

  // Edit and remove.
  await main(page).getByRole("button", { name: "Edit Ram Lee" }).click();
  await page.getByRole("dialog").getByLabel("Relationship (optional)").fill("son");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(main(page).getByText("son", { exact: true })).toBeVisible();
  await main(page).getByRole("button", { name: "Remove Sita Lee" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(main(page).getByText("Sita Lee", { exact: true })).toHaveCount(0);
  await expect(main(page).getByText("Ram Lee", { exact: true })).toBeVisible();
});
