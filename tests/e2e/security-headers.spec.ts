import { expect, test, type Page } from "@playwright/test";

function collectCspViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", msg => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (execute|load|apply|connect)/i.test(text)) violations.push(text);
  });
  return violations;
}

const SECURE_PAGES = ["/admin/login", "/login", "/sign/not-a-real-session"];

for (const path of SECURE_PAGES) {
  test(`secure page ${path} runs under a nonce CSP without violations`, async ({ page }) => {
    const violations = collectCspViolations(page);
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response?.headers()["cache-control"]).toContain("no-store");
    // Some secure pages poll the server, so wait for load plus a settle period
    // instead of network idle. Any blocked script shows up as a console violation.
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
    // Every script in the server-rendered HTML must carry this request's nonce.
    // (Chunks loaded later by those scripts are allowed through 'strict-dynamic'.)
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    const html = await (await page.request.get(path)).text();
    const htmlNonce = (await page.request.get(path)).headers()["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    expect(scriptTags.every(tag => /\snonce=/.test(tag))).toBe(true);
    expect(htmlNonce).not.toBe(nonce); // fresh nonce per request
    expect(violations).toEqual([]);
  });
}

// Public pages (the events pages since round 3, the board guide since round 4) get a fixed policy from
// next.config.mjs: scripts from this site only, and exactly one policy header.
for (const path of ["/", "/c/ghmo/events", "/docs/onboarding", "/donate"]) {
  test(`public page ${path} gets the baseline CSP without violations`, async ({ page }) => {
    const violations = collectCspViolations(page);
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("nonce-");
    expect(csp.split("script-src").length, "a single policy").toBe(2);
    await page.waitForLoadState("load");
    await page.waitForTimeout(1000);
    expect(violations).toEqual([]);
  });
}

test("baseline security headers are set", async ({ request }) => {
  const response = await request.get("/");
  const h = response.headers();
  expect(h["strict-transport-security"]).toContain("max-age=63072000");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("signing links never send a Referer", async ({ request }) => {
  const response = await request.get("/sign/not-a-real-session");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
});

test("API responses are not cached", async ({ request }) => {
  const response = await request.get("/api/auth/me");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("CSP blocks script injected into secure page HTML (simulated XSS)", async ({ page }) => {
  const violations = collectCspViolations(page);
  await page.route("**/admin/login", async route => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      "<body",
      '<body data-probe="1"><script>window.__INJECTED__=1</script><img src="/missing.png" onerror="window.__HANDLER__=1"'
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/admin/login");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__INJECTED__)).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__HANDLER__)).toBeUndefined();
  expect(violations.length).toBeGreaterThanOrEqual(2);
});
