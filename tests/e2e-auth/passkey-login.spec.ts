import { expect, test } from "@playwright/test";
import { addVirtualAuthenticator, clearEmulators, collectCspViolations, magicLinkSession, seedAdmin, setSession } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("magic link -> create passkey -> admin area, then passkey-only sign-in", async ({ page, context }) => {
  const violations = collectCspViolations(page);
  await addVirtualAuthenticator(page);

  // A magic-link session alone is not enough for the admin area.
  await setSession(context, await magicLinkSession("alice"));
  await page.goto("/admin/minutes");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fminutes/);
  await expect(page.getByRole("heading", { name: "Set up your sign-in" })).toBeVisible();
  await expect(page.getByText("Welcome, Alice.")).toBeVisible();

  // Create the passkey; the page then signs in with it and lands on the requested page.
  await page.getByLabel("Passkey device name").fill("Test laptop");
  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page).toHaveURL(/\/admin\/minutes$/, { timeout: 15_000 });

  // Fresh browser state: only the passkey is needed now.
  await context.clearCookies();
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Board member sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });

  // The admin shell marks the current page.
  await page.goto("/admin/events");
  const nav = page.getByRole("navigation", { name: "Admin" }).first();
  await expect(nav.getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

  // The Security page lists the passkey.
  await page.goto("/admin/security");
  await expect(page.getByText("Test laptop")).toBeVisible();
  await expect(page.getByText("Active")).toBeVisible();

  expect(violations).toEqual([]);
});
