import { expect, test } from "@playwright/test";

// The e2e build sets NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET to a marker script
// (see playwright.config.ts). It must run on public pages and must never survive
// into the admin area, even through a client-side link click.

declare global {
  interface Window {
    __THIRD_PARTY_MARKER__?: number;
  }
}

test("third-party script runs on public pages only", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__THIRD_PARTY_MARKER__)).toBe(1);

  await page.getByRole("link", { name: "Board member sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(await page.evaluate(() => window.__THIRD_PARTY_MARKER__)).toBeUndefined();
});

test("admin login HTML contains no third-party snippet", async ({ request }) => {
  const html = await (await request.get("/admin/login")).text();
  expect(html).not.toContain("__THIRD_PARTY_MARKER__");
  expect(html).not.toContain("gofundme-pro-install-snippet");
});
