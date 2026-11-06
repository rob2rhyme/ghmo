import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent, memberAction } from "./helpers";

/**
 * A super admin can fix a typo in a member's name. Nobody else can, and the rest of the record (email, consent,
 * phone flag) is untouched. Someone without an email is known by name and number, so their name can't be blanked.
 */

const ORG = "organizations/ghmo";
const main = (page: import("@playwright/test").Page) => page.locator("#admin-main");

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const { db } = admin();
  await db.doc(`${ORG}/members/m1`).set({
    name: "Mongal Puwrt",
    email: "mongal@example.org",
    emailLower: "mongal@example.org",
    status: "active",
    roles: ["member"],
    emailConsent: { source: "admin_on_request" },
    groupIds: []
  });
  await db.doc(`${ORG}/members/m2`).set({ name: "Dinesh Gurung", emailLower: "", status: "active", roles: ["member"], hasPhone: true });
});

test("a super admin fixes a typo in a name without touching anything else; the activity log keeps both spellings", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await waitForStreamedContent(page);

  await memberAction(page, "Mongal Puwrt", "Edit name");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Save name" })).toBeDisabled();
  await dialog.getByLabel("Name").fill("Mongal Puwart");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name updated")).toBeVisible();
  await expect(main(page).getByText("Mongal Puwart", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Mongal Puwrt", { exact: true })).toHaveCount(0);

  const member = (await db.doc(`${ORG}/members/m1`).get()).data()!;
  expect(member).toMatchObject({ name: "Mongal Puwart", emailLower: "mongal@example.org", status: "active", emailConsent: { source: "admin_on_request" } });
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_updated").get()).docs.map(d => d.data());
  expect(audit).toHaveLength(1);
  expect(audit[0].before).toMatchObject({ name: "Mongal Puwrt" });
  expect(audit[0].after).toMatchObject({ name: "Mongal Puwart" });
  expect(audit[0].actor).toMatchObject({ uid: "alice" });

  // Someone without an email is known by name and number, so the name can't be emptied.
  await memberAction(page, "Dinesh Gurung", "Edit name");
  const second = page.getByRole("dialog");
  await second.getByLabel("Name").fill("   ");
  await expect(second.getByRole("button", { name: "Save name" })).toBeDisabled();
  await second.getByRole("button", { name: "Cancel" }).click();
  const blank = await page.request.patch("/api/organizations/ghmo/members/m2", { data: { name: "" } });
  expect(blank.status()).toBe(400);
  expect((await db.doc(`${ORG}/members/m2`).get()).get("name")).toBe("Dinesh Gurung");

  // Someone with an email may have the name cleared; their email is shown instead.
  const cleared = await page.request.patch("/api/organizations/ghmo/members/m1", { data: { name: null } });
  expect(cleared.status()).toBe(200);
  expect((await db.doc(`${ORG}/members/m1`).get()).get("name")).toBeNull();
});

test("a plain admin sees no Edit name button and the server refuses a name change, but other updates still work", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "bob", "/admin/members");
  await waitForStreamedContent(page);
  await expect(main(page).getByText("Mongal Puwrt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More actions for Mongal Puwrt", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Groups" }).or(page.getByRole("menuitem", { name: "Turn off…" })).first()).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit name" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const refused = await page.request.patch("/api/organizations/ghmo/members/m1", { data: { name: "Someone Else" } });
  expect(refused.status()).toBe(403);
  expect(((await refused.json()) as { error: string }).error).toBe("Only a super admin can change a member's name.");
  expect((await db.doc(`${ORG}/members/m1`).get()).get("name")).toBe("Mongal Puwrt");

  // Sending the name a member already has is not a change, so other updates that carry it still work for every admin.
  const same = await page.request.patch("/api/organizations/ghmo/members/m1", { data: { name: " Mongal Puwrt ", emailOptOut: true } });
  expect(same.status()).toBe(200);
  expect((await db.doc(`${ORG}/members/m1`).get()).get("emailOptOutAt")).toBeTruthy();
  expect((await db.doc(`${ORG}/members/m1`).get()).get("name")).toBe("Mongal Puwrt");
});

test("the search box has a clear button that appears with text, empties the box and keeps the cursor there; Escape does the same", async ({ page }) => {
  test.setTimeout(90_000);
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await waitForStreamedContent(page);
  const search = page.getByRole("textbox", { name: "Search members" });
  const clear = page.getByRole("button", { name: "Clear search" });
  await expect(clear).toHaveCount(0);

  await search.fill("mong");
  await expect(main(page).getByText("Mongal Puwrt", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Dinesh Gurung", { exact: true })).toHaveCount(0);
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(main(page).getByText("Dinesh Gurung", { exact: true })).toBeVisible();
  await expect(clear).toHaveCount(0);

  await search.fill("dinesh");
  await expect(main(page).getByText("Mongal Puwrt", { exact: true })).toHaveCount(0);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(main(page).getByText("Mongal Puwrt", { exact: true })).toBeVisible();
});
