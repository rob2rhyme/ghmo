import { expect, test } from "@playwright/test";

test("public header shows a mobile menu with the main links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile layout only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("link", { name: "Donate" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
});

test("signed-out visitors do not see an Admin link in the header", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin sign in" })).toBeVisible();
});

test("admin shell marks the current page in its navigation", async ({ page, context }, testInfo) => {
  // A placeholder cookie gets past the proxy's redirect; the page itself still
  // refuses to load data without a real session. Only the shell is checked here.
  await context.addCookies([{ name: "__session", value: "placeholder", domain: "localhost", path: "/" }]);
  await page.goto("/admin/events");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open admin menu" }).click();
  }
  const nav = page.getByRole("navigation", { name: "Admin" }).last();
  await expect(nav.getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");
});
