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

test("a placeholder session cookie does not get into the admin area", async ({ page, context }) => {
  await context.addCookies([{ name: "__session", value: "placeholder", domain: "localhost", path: "/" }]);
  const response = await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fevents/);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
});
