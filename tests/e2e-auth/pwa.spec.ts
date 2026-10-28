import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("the web app manifest and icons are served, and pages link to them", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ short_name: "GHMO", start_url: "/", display: "standalone", theme_color: "#0f766e" });
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(["any", "any", "maskable"]);
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png" }]) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }

  for (const path of ["/", "/admin/login"]) {
    await page.goto(path);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  }
});

test("the service worker installs, shows an offline page when there is no connection, and never caches pages or API answers", async ({ page, context }) => {
  const sw = await page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/admin/login");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state ?? null), { timeout: 15_000 }).toBe("activated");
  // Load once more under the worker's control so it sees page, API and asset requests.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.evaluate(() => fetch("/api/auth/me").catch(() => null));

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached).toContain("/offline.html");
  expect(cached.some(path => path.startsWith("/_next/static/"))).toBe(true);
  expect(cached.filter(path => path.startsWith("/admin") || path.startsWith("/api") || path === "/")).toEqual([]);

  await context.setOffline(true);
  await page.goto("/admin/login").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
});
