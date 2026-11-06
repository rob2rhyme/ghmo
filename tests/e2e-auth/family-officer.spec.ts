import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/**
 * Seating a relative (owner request 2026-11-06, plan §28.8): on an unlocked device, Set holder offers people from
 * members' encrypted family lists who aren't members yet. Picking one adds them as a member (their number encrypted,
 * no call consent recorded) and seats them in one step.
 */
const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name, exact: true });

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("a member's spouse is seated as treasurer from the family list, and becomes a member", async ({ page }) => {
  test.setTimeout(240_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  // Sam is a member; his family list names Sita (with a number) and Ram (without).
  await nav(page, "Members").click();
  await page.getByLabel("Email", { exact: true }).fill("sam@example.org");
  await page.getByLabel("Name", { exact: true }).fill("Sam Lee");
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByRole("link", { name: "Profile of Sam Lee" }).click();
  const family = main(page).locator("section", { has: page.getByRole("heading", { name: "Family" }) });
  for (const [name, relationship, phone] of [["Sita Lee", "Spouse", "717-555-0111"], ["Ram Lee", "Son", ""]]) {
    await family.getByRole("button", { name: "Add family member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog.getByLabel("Relationship (optional)").fill(relationship);
    if (phone) await dialog.getByLabel("Phone number (optional)").fill(phone);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(family.getByText(name, { exact: true })).toBeVisible();
  }

  await nav(page, "Positions").click();
  await page.getByRole("button", { name: "Set holder for Treasurer" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Member").selectOption({ label: "Sita Lee (spouse of Sam Lee)" });
  await expect(dialog.getByLabel("Full name")).toHaveValue("Sita Lee");
  await expect(dialog.getByLabel(/^Phone/)).toHaveValue("(717) 555-0111");
  await expect(dialog.getByText(/From Sam Lee's family list/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save holder" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main(page).getByText("Sita Lee", { exact: true }).filter({ visible: true })).toBeVisible();

  const sita = (await db.collection(`${ORG}/members`).where("name", "==", "Sita Lee").get()).docs;
  expect(sita).toHaveLength(1);
  const data = sita[0].data();
  expect(data).toMatchObject({ status: "active", hasPhone: true, emailLower: "" });
  expect(data).not.toHaveProperty("phoneConsent");
  expect(data).not.toHaveProperty("emailConsent");
  expect(plainJson(data)).not.toContain("0111");
  const terms = (await db.collection(`${ORG}/positionTerms`).where("positionId", "==", "treasurer").get()).docs;
  expect(terms.map(t => t.get("memberId"))).toEqual([sita[0].id]);

  // Now a member, Sita is offered as one; Ram (no number, no email) needs an email or a phone first.
  await page.getByRole("button", { name: "Set holder for Secretary" }).click();
  dialog = page.getByRole("dialog");
  const picker = dialog.getByLabel("Member");
  await expect(picker.locator("option", { hasText: "Sita Lee (spouse" })).toHaveCount(0);
  await expect(picker.locator("option", { hasText: /^Sita Lee$/ })).toHaveCount(1);
  await picker.selectOption({ label: "Ram Lee (son of Sam Lee)" });
  await expect(dialog.getByRole("button", { name: "Save holder" })).toBeDisabled();
  await dialog.getByLabel(/^Email/).fill("ram@example.org");
  await dialog.getByRole("button", { name: "Save holder" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await db.collection(`${ORG}/members`).where("emailLower", "==", "ram@example.org").get()).docs[0].get("name")).toBe("Ram Lee");
});
