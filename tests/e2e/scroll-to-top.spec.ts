import { expect, test } from "@playwright/test";

test("scroll-to-top button appears after scrolling, shows progress and returns to the top", async ({ page }) => {
  await page.goto("/");
  // Make the page tall enough to scroll regardless of the content.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "4000px";
    document.body.appendChild(spacer);
  });

  const button = page.getByTestId("scroll-to-top");
  await expect(button).toBeHidden();

  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName("Scroll to top");
  const midway = Number(await button.getAttribute("data-progress"));
  expect(midway).toBeGreaterThan(0);
  expect(midway).toBeLessThan(1);

  // The ring is drawn: its progress arc is partly dashed.
  const offset = await button.locator("circle").nth(1).getAttribute("stroke-dashoffset");
  expect(Number(offset)).toBeGreaterThan(0);

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect.poll(async () => Number(await button.getAttribute("data-progress"))).toBe(1);

  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(button).toBeHidden();
});

test("scroll-to-top button is not on admin pages", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByTestId("scroll-to-top")).toHaveCount(0);
});
