import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice Rai", ["super_admin"]);
});

test("the dashboard greets the admin, lists real activity with titles, and shows who is signed in", async ({ page }) => {
  await admin().db.collection("organizations/ghmo/auditLogs").add({
    action: "passkey_registered",
    resource: { type: "passkey", summary: "Passkey registered: Sita's iPhone" },
    actor: { name: "Alice Rai", role: "super_admin" },
    createdAt: Timestamp.fromMillis(Date.now() - 2 * 3_600_000)
  });
  await signInWithNewPasskey(page, "alice", "/admin");

  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText("Welcome back, Alice.")).toBeVisible();
  // Real audit entries keep the description under resource.summary; it must show as the title.
  await expect(page.getByText("Passkey registered: Sita's iPhone")).toBeVisible();
  await expect(page.getByText("2 h ago", { exact: false }).first()).toBeVisible();

  // The signed-in admin is shown in the sidebar.
  const sidebar = page.locator("aside");
  await expect(sidebar.getByText("Alice Rai")).toBeVisible();
  await expect(sidebar.getByText("Super admin")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(sidebar.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

  await expect(page.locator("#admin-main").getByRole("link", { name: /Meeting minutes.*Draft, approve/ })).toBeVisible();
});

test("Ctrl+K opens the page search; typing and Enter jump to a page, arrow keys move the selection", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Jump to a page" });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();

  // Scope to the dialog's list: pages such as Meeting minutes have their own <select> options, which
  // come earlier in the page and would otherwise be picked up as "the first option".
  const options = page.getByRole("listbox", { name: "Pages" }).getByRole("option");
  await search.fill("minu");
  await expect(options).toHaveCount(1);
  await expect(options.filter({ hasText: "Meeting minutes" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/minutes$/);

  // The list also highlights whatever the mouse rests on, so keep the pointer out of the way.
  await page.mouse.move(0, 0);
  await page.keyboard.press("Control+k");
  await expect(search).toBeVisible();
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/comms$/);

  // Nothing matches: say so, and Escape closes it.
  await page.keyboard.press("Control+k");
  await search.fill("zzzz");
  await expect(page.getByText("No page matches")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
});

test("on a phone the dashboard goes from the figures straight to the recent lists", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin");
  const main = page.locator("#admin-main");

  await expect(main.getByText("To approve", { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Recent minutes" })).toBeVisible();
  // Quick actions are for wider screens; on a phone the menu and Ctrl/⌘ K cover them.
  await expect(main.getByRole("heading", { name: "Quick actions" })).toBeHidden();
  await expect(main.getByRole("link", { name: /Gumba Project/ })).toBeHidden();
  // The dashboard has no second search box; the page search is the one in the top bar.
  await expect(page.getByRole("searchbox", { name: "Filter the dashboard" })).toHaveCount(0);
  await context.close();
});

test("on a phone the menu shows every page, then the user and Sign out at the end", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin");

  await page.getByRole("button", { name: "Open admin menu" }).click();
  const menu = page.getByRole("dialog");
  // The whole menu scrolls as one: nothing is pinned over the page list, so pages down to
  // Document gallery are in view at once, and the account area follows the last page.
  await expect(menu.getByRole("link", { name: "Document gallery", exact: true })).toBeInViewport();
  for (const name of ["Security", "Encryption"]) {
    await menu.getByRole("link", { name, exact: true }).scrollIntoViewIfNeeded();
    await expect(menu.getByRole("link", { name, exact: true })).toBeInViewport();
  }
  await menu.getByRole("button", { name: "Sign out" }).scrollIntoViewIfNeeded();
  await expect(menu.getByText("Alice Rai")).toBeInViewport();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeInViewport();

  await menu.getByRole("link", { name: "Security", exact: true }).scrollIntoViewIfNeeded();
  await menu.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/security$/);
  await context.close();
});

test("Plans & Issues: the header's New topic button opens the form with the title field ready", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/comms");
  await page.getByRole("link", { name: "New topic" }).click();
  await expect(page).toHaveURL(/\/admin\/comms\?new=1$/);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
});
