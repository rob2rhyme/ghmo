import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "demo-ghmo";

function admin() {
  const app =
    getApps()[0] ??
    initializeApp({
      projectId: PROJECT,
      credential: cert({
        projectId: PROJECT,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!
      })
    });
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function clearEmulators() {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

/** Session cookie equivalent to having just clicked an emailed magic link. */
async function magicLinkSession(uid: string) {
  const { auth } = admin();
  await auth.createUser({ uid }).catch(() => undefined);
  const customToken = await auth.createCustomToken(uid, { orgSlug: "ghmo", role: "admin", admin: true, authMethod: "magic_link" });
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const { idToken } = (await res.json()) as { idToken: string };
  return auth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 1000 });
}

/** Chromium's built-in software authenticator: platform passkey with biometrics. */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });
}

async function setSession(context: BrowserContext, value: string) {
  await context.addCookies([{ name: "__session", value, domain: "localhost", path: "/", httpOnly: true }]);
}

test.beforeEach(async () => {
  await clearEmulators();
  await admin().db.doc("organizations/ghmo/admins/alice").set({
    status: "active",
    emailLower: "alice@example.org",
    roles: ["super_admin"],
    name: "Alice"
  });
});

test("magic link -> create passkey -> admin area, then passkey-only sign-in", async ({ page, context }) => {
  const violations: string[] = [];
  page.on("console", m => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await addVirtualAuthenticator(page);

  // A magic-link session alone is not enough for the admin area.
  await setSession(context, await magicLinkSession("alice"));
  await page.goto("/admin/minutes");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fminutes/);
  await expect(page.getByRole("heading", { name: "Set up your passkey" })).toBeVisible();
  await expect(page.getByText("Welcome, Alice.")).toBeVisible();

  // Create the passkey; the page then signs in with it and lands in the admin area.
  await page.getByLabel("Name this device").fill("Test laptop");
  await page.getByRole("button", { name: "Create passkey" }).click();
  // Lands back on the page that was originally requested.
  await expect(page).toHaveURL(/\/admin\/minutes$/, { timeout: 15_000 });
  await expect(page.getByRole("navigation", { name: "Admin" }).first()).toBeVisible();

  // Fresh browser state: only the passkey is needed now.
  await context.clearCookies();
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });

  // The admin shell marks the current page.
  await page.goto("/admin/events");
  const nav = page.getByRole("navigation", { name: "Admin" }).first();
  await expect(nav.getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

  // The Security page lists the passkey.
  await page.goto("/admin/security");
  await expect(page.getByText("Test laptop")).toBeVisible();
  await expect(page.getByText("Active")).toBeVisible();

  expect(violations).toEqual([]);
});
