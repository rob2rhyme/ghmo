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

  await expect(page.locator("#admin-main").getByRole("link", { name: /Meeting Minutes.*Draft, approve/ })).toBeVisible();
});

test("Ctrl+K opens the page search; typing and Enter jump to a page, arrow keys move the selection", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Jump to a page" });
  await expect(search).toBeVisible();
  await expect(search).toBeFocused();

  await search.fill("minu");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: /Meeting Minutes/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/minutes$/);

  // The list highlights whatever the mouse rests on, so park the pointer out of the way first.
  await page.mouse.move(0, 0);
  await page.keyboard.press("Control+k");
  await expect(search).toBeVisible();
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/comms$/);

  // Nothing matches: say so, and Escape closes it.
  await page.keyboard.press("Control+k");
  await search.fill("zzzz");
  await expect(page.getByText("No page matches")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
});

test("the dashboard filter narrows the quick actions and is reached with the / key", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.waitForLoadState("networkidle");
  const main = page.locator("#admin-main");
  await page.keyboard.press("/");
  const filter = page.getByRole("searchbox", { name: "Filter the dashboard" });
  await expect(filter).toBeFocused();
  await filter.fill("gumba");
  await expect(main.getByRole("link", { name: /GUMBA Project/ })).toBeVisible();
  await expect(main.getByRole("link", { name: /Meeting Minutes.*Draft, approve/ })).toHaveCount(0);
  await filter.fill("nothing like this");
  await expect(page.getByText("No quick actions match your filter.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filter" }).click();
  await expect(main.getByRole("link", { name: /Meeting Minutes.*Draft, approve/ })).toBeVisible();
});

test("on a phone the menu keeps every page, the user and Sign out in view", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin");

  await page.getByRole("button", { name: "Open admin menu" }).click();
  const menu = page.getByRole("dialog");
  // The page list scrolls inside the menu; the user card and Sign out stay pinned in view.
  await expect(menu.getByText("Alice Rai")).toBeInViewport();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeInViewport();
  await menu.getByRole("link", { name: "Encryption", exact: true }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole("link", { name: "Encryption", exact: true })).toBeInViewport();
  await menu.getByRole("link", { name: "Security", exact: true }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole("link", { name: "Security", exact: true })).toBeInViewport();
  await expect(menu.getByText("Alice Rai")).toBeInViewport();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeInViewport();

  await menu.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/security$/);
  await context.close();
});
