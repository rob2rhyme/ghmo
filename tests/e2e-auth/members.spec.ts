import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, memberAction } from "./helpers";

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
  await page.getByLabel("Name", { exact: true }).fill("Sam Lee");
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

  await memberAction(page, "sam@example.org", "Record consent");
  await expect(shown(page, "Asked to be added")).toBeVisible();
  await memberAction(page, "sam@example.org", "They asked to stop");
  await expect(shown(page, "Opted out").first()).toBeVisible();
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeTruthy();

  await memberAction(page, "sam@example.org", "They asked to be added back");
  await expect(shown(page, "Can be emailed").first()).toBeVisible();
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeNull();

  await memberAction(page, "sam@example.org", "Turn off…");
  await page.getByRole("dialog").getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(shown(page, "Turned off").first()).toBeVisible();
});

test("importing needs the consent attestation, skips existing people and never re-subscribes an opt-out", async ({ page }) => {
  await members().doc("old").set({ email: "old@example.org", emailLower: "old@example.org", status: "active", roles: ["member"], emailOptOutAt: new Date() });
  await signInWithNewPasskey(page, "alice", "/admin/members");

  await page.getByRole("button", { name: "Import a list" }).click();
  await page.getByLabel("Paste your list").fill("email,name\nnew@example.org,New Person\nold@example.org,Old Person\nbroken\n");
  await expect(shown(page, "2 people found.")).toBeVisible();
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

test("each row shows Profile and a More menu with only what applies, and the list shows 50 at a time", async ({ browser }) => {
  test.setTimeout(120_000);
  const batch = admin().db.batch();
  for (let i = 1; i <= 120; i += 1) {
    const n = String(i).padStart(3, "0");
    batch.set(members().doc(`p${n}`), { name: `Person ${n}`, email: `p${n}@example.org`, emailLower: `p${n}@example.org`, status: "active", roles: ["member"], ...(i === 1 ? { emailConsent: { source: "signed_up", at: new Date() } } : {}) });
  }
  await batch.commit();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const list = page.getByRole("list", { name: "Members" });
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await expect(page.getByText("Showing 50 of 120")).toBeVisible();

  // On a phone, a row has just two controls.
  const first = list.getByRole("listitem").filter({ hasText: "Person 001" });
  await expect(first.getByRole("link")).toHaveCount(1);
  await expect(first.getByRole("button")).toHaveCount(1);

  // Person 001 can be emailed, so the menu offers the opt-out and not consent; Turn off… is last.
  await page.getByRole("button", { name: "More actions for Person 001", exact: true }).click();
  const items = page.getByRole("menuitem");
  await expect(items.filter({ hasText: "They asked to stop" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Record consent" })).toHaveCount(0);
  await expect(items.last()).toHaveText(/Turn off…/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Show 50 more" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(100);
  await page.getByRole("button", { name: "Show 20 more" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(120);
  await expect(page.getByRole("button", { name: /^Show \d+ more$/ })).toHaveCount(0);

  // A search starts again from the top of its own matches.
  await page.getByLabel("Search members").fill("Person 11");
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await context.close();
});
