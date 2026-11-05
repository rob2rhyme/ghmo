import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent } from "./helpers";

/**
 * Phase 11-C (plan §15): the phone tree callers group suggests callers for the calling tree. Members who are admins
 * (matched by email) are suggested; members who are not are listed as needing admin access. It only suggests: the
 * tree still takes only admins that a super admin ticks and saves.
 */

const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["admin"]);
  const { db } = admin();
  // Bob and Dinesh are in the callers group. Bob's member record uses his admin email; Dinesh is not an admin;
  // Esha is in the group but disabled, so she is ignored. Carol is an admin who is not in the group.
  const people: [string, string, string, string][] = [
    ["m-bob", "Bob Khadka", "bob@example.org", "active"],
    ["m-dinesh", "Dinesh Rai", "dinesh@example.org", "active"],
    ["m-esha", "Esha Gurung", "esha@example.org", "disabled"],
    ["m-carol", "Carol Thapa", "carol@example.org", "active"]
  ];
  for (const [id, name, email, status] of people) {
    await db.doc(`${ORG}/members/${id}`).set({
      email,
      emailLower: email,
      name,
      status,
      roles: ["member"],
      groupIds: id === "m-carol" ? [] : ["phone_tree_callers"]
    });
  }
});

test("the callers group suggests admins as callers, flags people who need admin access, and only suggests", async ({ page }) => {
  test.setTimeout(180_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  // The group is created the first time anyone looks; open the Groups page so it exists.
  await page.goto("/admin/groups/phone_tree_callers");
  await waitForStreamedContent(page);
  const bobRow = main(page).getByRole("listitem").filter({ hasText: "Bob Khadka" });
  const dineshRow = main(page).getByRole("listitem").filter({ hasText: "Dinesh Rai" });
  await expect(bobRow.getByText("Admin", { exact: true })).toBeVisible();
  await expect(dineshRow.getByText("Needs admin access to use My Calls")).toBeVisible();
  // A disabled member gets neither badge.
  const eshaRow = main(page).getByRole("listitem").filter({ hasText: "Esha Gurung" });
  await expect(eshaRow.getByText("Disabled")).toBeVisible();
  await expect(eshaRow.getByText("Admin", { exact: true })).toHaveCount(0);
  await expect(eshaRow.getByText(/Needs admin access/)).toHaveCount(0);

  // Calling tree: Bob is suggested and listed first, the alert names Dinesh only.
  // Move by the menu: a full page load would lock the device keys the calling tree needs.
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Calling tree" }).click();
  // Loading the group page above was a full page load, which locked the device keys; unlock again.
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  const callers = page.getByRole("list", { name: "Callers" });
  await expect(callers.getByRole("listitem").first()).toContainText("Bob");
  await expect(callers.getByRole("listitem").first().getByText("In Phone tree callers")).toBeVisible();
  await expect(callers.getByRole("listitem").filter({ hasText: "Carol" }).getByText(/In Phone tree callers/)).toHaveCount(0);
  const alert = main(page).getByRole("alert").filter({ hasText: "need admin access" });
  await expect(alert).toContainText("Dinesh Rai");
  await expect(alert).not.toContainText("Esha");
  await expect(alert).not.toContainText("Bob Khadka");

  // Suggestions never tick anyone by themselves; the button checks them, and nothing is saved until Save.
  await expect(callers.getByLabel("Bob")).not.toBeChecked();
  await page.getByRole("button", { name: "Check everyone in the group" }).click();
  await expect(callers.getByLabel("Bob")).toBeChecked();
  await expect(callers.getByLabel("Carol")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Check everyone in the group" })).toBeDisabled();
  expect((await db.doc(`${ORG}/callingTree/current`).get()).exists).toBe(false);
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved/)).toBeVisible();
  expect((await db.doc(`${ORG}/callingTree/current`).get()).get("callers")).toEqual(["bob"]);

  // Switching the group off stops the suggestions; the tree keeps working as before.
  const off = await page.request.patch("/api/admin/groups/phone_tree_callers", { data: { active: false } });
  expect(off.status()).toBe(200);
  await page.reload();
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(page.getByRole("list", { name: "Callers" })).toBeVisible();
  await expect(main(page).getByText("In Phone tree callers")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check everyone in the group" })).toHaveCount(0);
  await expect(main(page).getByRole("alert").filter({ hasText: "need admin access" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Callers" }).getByLabel("Bob")).toBeChecked();
});

test("a plain admin sees the suggestions but not the button, and a non-admin still cannot be saved as a caller", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  // Make sure the group exists before Bob looks.
  await db.doc(`${ORG}/groups/phone_tree_callers`).set({ name: "Phone tree callers", description: "", leadMemberId: null, kind: "callers", active: true, builtIn: true });
  await signInWithNewPasskey(page, "bob", "/admin/calling-tree");
  await waitForStreamedContent(page);
  const status = await page.request.get("/api/admin/calling-tree");
  const body = (await status.json()) as { candidates: { id: string; suggested: boolean }[]; callersGroup: { needsAdminAccess: { name: string }[] } | null };
  expect(body.candidates.find(c => c.id === "bob")?.suggested).toBe(true);
  expect(body.candidates.find(c => c.id === "carol")?.suggested).toBe(false);
  expect(body.callersGroup?.needsAdminAccess.map(p => p.name)).toEqual(["Dinesh Rai"]);
  await expect(page.getByRole("button", { name: "Check everyone in the group" })).toHaveCount(0);

  // The rule that callers are admins still holds on the server, whoever the group suggests.
  const refused = await page.request.put("/api/admin/calling-tree", { data: { callers: ["m-dinesh"], assignments: [] } });
  expect(refused.status()).toBe(403);
});
