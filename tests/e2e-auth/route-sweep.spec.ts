import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { admin, clearEmulators, magicLinkSession, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Calls every API route with no credentials. Anything not on the public list must refuse with
 * 401/403 for every method it exports, and no route may answer an anonymous write with success
 * or a server error. A new route that forgets its guard fails here.
 */
const API_ROOT = join(process.cwd(), "app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

const PARAMS: Record<string, string> = {
  orgSlug: "ghmo",
  sessionId: "a".repeat(64)
};

type Route = { path: string; methods: string[] };

const routes: Route[] = routeFiles(API_ROOT).map(file => {
  const source = readFileSync(file, "utf8");
  const methods = METHODS.filter(m => new RegExp(`export (async function|const) ${m}\\b`).test(source));
  const path =
    "/api" +
    file
      .slice(API_ROOT.length, -"/route.ts".length)
      .replace(/\[(\w+)\]/g, (_, name: string) => PARAMS[name] ?? "x1");
  return { path, methods };
});

/** Public by design. For these, only "no anonymous write succeeds and nothing 5xx" is asserted. */
const PUBLIC_PREFIXES = [
  "/api/auth/", // sign-in flows
  "/api/calendar", // published events as .ics
  `/api/signing-sessions/`, // secret-link signing
  "/api/gfmpro/webhook", // signature-checked webhook
  "/api/media/youtube",
  "/api/organizations/ghmo/events",
  "/api/organizations/ghmo/donations/stats",
  "/api/unsubscribe", // signed-link credential, POST only
  "/api/resend/webhook" // signature-checked webhook
];
const isPublic = (path: string) => PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix));

test("the route inventory is not empty", () => {
  expect(routes.length).toBeGreaterThan(40);
  expect(routes.every(route => route.methods.length > 0)).toBe(true);
});

for (const route of routes) {
  for (const method of route.methods) {
    test(`${method} ${route.path} refuses anonymous callers`, async ({ request }) => {
      const response = await request.fetch(route.path, {
        method,
        headers: { "content-type": "application/json" },
        data: method === "GET" ? undefined : "{}",
        maxRedirects: 0
      });
      const status = response.status();
      expect(status, "an anonymous request must never cause a server error").toBeLessThan(500);
      if (!isPublic(route.path)) {
        // 404/405 are refusals too: a disabled route (bootstrap) or a method the route does not serve.
        expect([401, 403, 404, 405], `${method} ${route.path} answered ${status} without credentials`).toContain(status);
      } else if (method !== "GET" && !route.path.startsWith("/api/auth/")) {
        // Sign-in routes answer anonymous POSTs with 200 by design (they start a login, or reply
        // "ok" without revealing whether an email exists); they are covered by the auth tests.
        expect(status, `${method} ${route.path} accepted an anonymous write`).toBeGreaterThanOrEqual(400);
      }
    });
  }
}

/**
 * People who are signed in but must not get admin data: a stranger with no admin record, a
 * disabled admin, and a real admin who has only used a magic link (admin routes need a passkey).
 */
// Every route that is not public by design: a disabled or magic-link-only admin must be refused everywhere,
// not only under /admin/ (a route elsewhere once checked a token claim alone).
const ADMIN_ROUTES = routes.filter(route => !isPublic(route.path));
// Passkey enrollment is the one thing a magic-link admin may do: it is how they get a passkey.
const MAGIC_LINK_ALLOWED = ["/api/admin/passkeys"];

test.describe("signed in, but not a passkey admin", () => {
  let cookies: Record<string, string>;

  test.beforeAll(async () => {
    await clearEmulators();
    await seedAdmin("real-admin", "Real Admin", ["admin"]);
    await seedAdmin("gone-admin", "Gone Admin", ["admin"]);
    await admin().db.doc("organizations/ghmo/admins/gone-admin").update({ status: "disabled" });
    cookies = {
      stranger: await magicLinkSession("stranger"),
      "magic-link admin": await magicLinkSession("real-admin"),
      "disabled admin": await magicLinkSession("gone-admin")
    };
  });

  for (const route of ADMIN_ROUTES) {
    for (const method of route.methods) {
      test(`${method} ${route.path} refuses them`, async ({ request }) => {
        for (const [who, cookie] of Object.entries(cookies)) {
          if (who === "magic-link admin" && MAGIC_LINK_ALLOWED.some(prefix => route.path.startsWith(prefix))) continue;
          const response = await request.fetch(route.path, {
            method,
            headers: { "content-type": "application/json", cookie: `__session=${cookie}` },
            data: method === "GET" ? undefined : "{}",
            maxRedirects: 0
          });
          expect([401, 403, 404, 405], `${who}: ${method} ${route.path} answered ${response.status()}`).toContain(response.status());
        }
      });
    }
  }
});

test.describe("requests started by another site", () => {
  test("cookie-authenticated writes are refused when the browser says they came from elsewhere", async ({ page }) => {
    await clearEmulators();
    await seedAdmin("alice", "Alice", ["super_admin"]);
    await signInWithNewPasskey(page, "alice", "/admin/security");
    const post = (headers: Record<string, string> = {}) => page.request.post("/api/admin/notify", { headers, data: { kind: "chat" } });

    expect((await post()).status()).toBe(200);
    expect((await post({ "sec-fetch-site": "same-origin" })).status()).toBe(200);
    expect((await post({ "sec-fetch-site": "cross-site" })).status()).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site" })).status()).toBe(403);
    // Reads are unaffected.
    expect((await page.request.get("/api/admin/notifications", { headers: { "sec-fetch-site": "cross-site" } })).status()).toBe(200);
  });
});
