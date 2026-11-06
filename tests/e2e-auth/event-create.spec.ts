import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Pages and actions the 2026-11-06 audit found no browser test for: creating an event from the New event page, and opening
 * the admin Document gallery and Gumba Project pages.
 */
const ORG = "organizations/ghmo";
const { db } = admin();

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("an admin creates an event from the New event page and lands on its edit page", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/events");
  const main = page.locator("#admin-main");
  await main.getByRole("link", { name: "New event" }).first().click();
  await page.waitForURL(/\/admin\/events\/new$/);
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();

  // Saving an empty form shows what is missing and creates nothing.
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.locator("#admin-main [id$='-error'], #admin-main [role='alert']").first()).toBeVisible();
  expect((await db.collection(`${ORG}/events`).get()).size).toBe(0);

  await page.getByLabel("Event name").fill("Dashain gathering");
  await page.getByLabel("Short summary").fill("Food, music and tika.");
  await page.getByLabel("Full details").fill("Bring a dish to share.");
  await page.getByLabel("Starts").fill("2026-12-05T18:00");
  await page.getByLabel("Place").fill("Community hall");
  await page.getByRole("button", { name: "Save event" }).click();

  await page.waitForURL(/\/admin\/events\/[^/]+\/edit$/, { timeout: 15_000 });
  const events = await db.collection(`${ORG}/events`).get();
  expect(events.size).toBe(1);
  expect(events.docs[0].data()).toMatchObject({ title: "Dashain gathering", location: "Community hall", status: "draft" });
  expect(page.url()).toContain(`/admin/events/${events.docs[0].id}/edit`);
  const logged = await db.collection(`${ORG}/auditLogs`).where("action", "==", "event_created").get();
  expect(logged.size).toBe(1);
});

test("the admin Document gallery and Gumba Project pages open", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/document-gallery");
  await expect(page.getByRole("heading", { name: "Document gallery" })).toBeVisible();
  await expect(page.getByText("No saved documents yet")).toBeVisible();

  await page.goto("/admin/gumba-project");
  await waitForStreamedContent(page);
  await expect(page.getByRole("heading", { name: "Gumba Project" })).toBeVisible();
  await expect(page.getByText("Fundraising progress")).toBeVisible();
});
