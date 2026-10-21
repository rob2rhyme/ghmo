import { expect, test } from "@playwright/test";

test("admin area redirects to login when signed out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
});

test("admin login page renders", async ({ page }) => {
  const response = await page.goto("/admin/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});

test("debug cookie route is not exposed in production", async ({ request }) => {
  const response = await request.get("/api/debug/cookies");
  expect(response.status()).toBe(404);
});
