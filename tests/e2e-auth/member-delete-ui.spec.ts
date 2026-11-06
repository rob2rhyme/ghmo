import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/** 15-B: Delete member on the profile. Super admins only; the preview and the typed name come first; officer history keeps the term. */
const ORG = "organizations/ghmo";
const { db } = admin();
const MAYA = "mem0001";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await db.doc(`${ORG}/members/${MAYA}`).set({ name: "Maya Gurung", email: "maya@example.org", emailLower: "maya@example.org", status: "active", roles: ["member"] });
  await db.doc(`${ORG}/members/mem0002`).set({ name: "Other Person", email: "other@example.org", emailLower: "other@example.org", status: "active", roles: ["member"] });
  for (const id of ["n1", "n2"]) await db.doc(`${ORG}/members/${MAYA}/notes/${id}`).set({ enc: { v: 1 }, authorUid: "alice", authorName: "Alice", createdAt: new Date() });
  await db.doc(`${ORG}/positionTerms/pt1`).set({ positionId: "treasurer", memberId: MAYA, startsOn: "2024-01-01", endsOn: null, note: "" });
});

test("a plain admin does not see the Delete member card", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/members");
  await page.goto(`/admin/members/${MAYA}`);
  await waitForStreamedContent(page);
  await expect(page.getByRole("heading", { name: "Maya Gurung" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete this member" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Delete member/ })).toHaveCount(0);
});

test("a super admin sees what will go, must type the name, and lands back on the list; the officer term stays", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await page.goto(`/admin/members/${MAYA}`);
  await waitForStreamedContent(page);
  await expect(page.getByRole("heading", { name: "Delete this member" })).toBeVisible();
  await page.getByRole("button", { name: "Delete member…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete Maya Gurung?" })).toBeVisible();
  // The preview comes from the server: what is removed, and what stays.
  await expect(dialog.getByText("2 notes", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/1 officer term stay as history/)).toBeVisible();
  await expect(dialog.getByText(/activity log is never edited/)).toBeVisible();

  // Nothing happens until the name is typed.
  const confirm = dialog.getByRole("button", { name: "Delete member" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type "Maya Gurung" to confirm').fill("Maya");
  await expect(confirm).toBeDisabled();
  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(true);
  await dialog.getByLabel('Type "Maya Gurung" to confirm').fill("maya gurung");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await page.waitForURL(/\/admin\/members$/, { timeout: 15_000 });
  await waitForStreamedContent(page);
  await expect(page.locator("#admin-main").getByText("Other Person", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#admin-main").getByText("Maya Gurung", { exact: true })).toHaveCount(0);
  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(false);
  expect((await db.collection(`${ORG}/members/${MAYA}/notes`).get()).size).toBe(0);
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_deleted").get()).size).toBe(1);

  // Officer history keeps the term, without the name.
  await page.goto("/admin/positions");
  await waitForStreamedContent(page);
  const treasurer = page.locator("#admin-main").getByRole("listitem").filter({ hasText: "Treasurer" }).first();
  await expect(treasurer.getByText("Removed member")).toBeVisible();
  expect((await db.doc(`${ORG}/positionTerms/pt1`).get()).exists).toBe(true);

  // The profile is gone: the page shows no profile, and the server answers 404 for it.
  // (A not-found answer leaves React's hidden streaming holder in place, so the helper that waits for it to empty is not used.)
  await page.goto(`/admin/members/${MAYA}`);
  await expect(page.getByRole("heading", { name: "Maya Gurung" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Delete this member" })).toHaveCount(0);
  expect((await page.request.get(`/api/organizations/ghmo/members/${MAYA}/deletion`)).status()).toBe(404);
});
