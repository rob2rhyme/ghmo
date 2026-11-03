import { expect, test } from "@playwright/test";

// The e2e build sets NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET to a marker script
// (see playwright.config.ts). It runs on the Donate page only (after the page loads),
// and must never survive into the admin area, even through a client-side link click.

declare global {
  interface Window {
    __THIRD_PARTY_MARKER__?: number;
  }
}

test("third-party script runs on the Donate page only", async ({ page }) => {
  // Other public pages don't load it.
  await page.goto("/");
  await page.waitForLoadState("load");
  expect(await page.evaluate(() => window.__THIRD_PARTY_MARKER__)).toBeUndefined();

  await page.goto("/donate");
  await expect.poll(() => page.evaluate(() => window.__THIRD_PARTY_MARKER__)).toBe(1);

  await page.getByRole("link", { name: "Board member sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(await page.evaluate(() => window.__THIRD_PARTY_MARKER__)).toBeUndefined();
});

test("the home page HTML carries no third-party snippet", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toContain("__THIRD_PARTY_MARKER__");
  expect(html).not.toContain("gofundme-pro-install-snippet");
});

test("admin login HTML contains no third-party snippet", async ({ request }) => {
  const html = await (await request.get("/admin/login")).text();
  expect(html).not.toContain("__THIRD_PARTY_MARKER__");
  expect(html).not.toContain("gofundme-pro-install-snippet");
});
