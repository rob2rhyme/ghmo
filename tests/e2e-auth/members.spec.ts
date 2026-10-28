import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

const members = () => admin().db.collection("organizations/ghmo/members");
/**
 * Visible text inside the admin page's main area, matched exactly. Page-wide substring lookups can also
 * hit hidden copies (for example a streamed page part that hasn't been swapped in yet) or toasts; two
 * VISIBLE copies would still fail the test, so this cannot hide a real duplicate.
 */
const shown = (page: Page, text: string) => page.locator("#admin-main").getByText(text, { exact: true }).filter({ visible: true });
const byEmail = async (email: string) => (await members().where("emailLower", "==", email).get()).docs[0]?.data();

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("adding a member records consent only when the box is ticked", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await expect(shown(page, "No members yet")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill("Sam@Example.org");
  await page.getByLabel("Name (optional)").fill("Sam Lee");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "No consent recorded")).toBeVisible();
  expect((await byEmail("sam@example.org"))?.emailConsent).toBeUndefined();

  await page.getByLabel("Email", { exact: true }).fill("pat@example.org");
  await page.getByLabel("This person asked to receive email from us.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "Can be emailed").first()).toBeVisible();
  const pat = await byEmail("pat@example.org");
  expect(pat?.emailConsent).toMatchObject({ source: "admin_on_request", byUid: "alice" });
});

test("an admin can record consent, an opt-out, and disable a member", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await page.getByLabel("Email", { exact: true }).fill("sam@example.org");
  await page.getByRole("button", { name: "Add member" }).click();

  await page.getByRole("button", { name: "Record consent" }).click();
  await expect(shown(page, "Asked to be added")).toBeVisible();
  await page.getByRole("button", { name: "They asked to stop" }).click();
  await expect(shown(page, "Opted out").first()).toBeVisible();
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeTruthy();

  await page.getByRole("button", { name: "They asked to be added back" }).click();
  await expect(shown(page, "Can be emailed").first()).toBeVisible();
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeNull();

  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(shown(page, "Disabled").first()).toBeVisible();
});

test("importing needs the consent attestation, skips existing people and never re-subscribes an opt-out", async ({ page }) => {
  await members().doc("old").set({ email: "old@example.org", emailLower: "old@example.org", status: "active", roles: ["member"], emailOptOutAt: new Date() });
  await signInWithNewPasskey(page, "alice", "/admin/members");

  await page.getByLabel("Member list").fill("email,name\nnew@example.org,New Person\nold@example.org,Old Person\nbroken\n");
  await expect(shown(page, "2 valid addresses found.")).toBeVisible();
  await expect(page.getByText("is not a valid email address")).toBeVisible();

  const importButton = page.getByRole("button", { name: /^Import 2 members$/ });
  await expect(importButton).toBeDisabled();
  await page.getByLabel(/These people agreed to receive email/).check();
  await importButton.click();
  await expect(page.getByText("1 added, 1 already on the list")).toBeVisible();

  expect((await byEmail("new@example.org"))?.emailConsent).toMatchObject({ source: "imported", byUid: "alice" });
  const old = await byEmail("old@example.org");
  expect(old?.emailOptOutAt).toBeTruthy();
  expect(old?.emailConsent).toBeUndefined();
  expect((await members().get()).size).toBe(2);

  const audit = await admin().db.collection("organizations/ghmo/auditLogs").where("action", "==", "members_imported").get();
  expect(audit.size).toBe(1);
  expect(JSON.stringify(audit.docs[0].data())).not.toContain("new@example.org");
});

test("the import API refuses a request without the attestation", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/organizations/ghmo/members/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ email: "x@example.org" }], attested: false })
    });
    return res.status;
  });
  expect(status).toBe(400);
  expect((await members().get()).size).toBe(0);
});
