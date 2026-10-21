import type { BrowserContext, Page } from "@playwright/test";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const PROJECT = "demo-ghmo";

export function admin() {
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

export async function clearEmulators() {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

/** Session cookie equivalent to having just clicked an emailed magic link. */
export async function magicLinkSession(uid: string) {
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

/** Chromium's built-in software authenticator: platform passkey with biometrics and PRF. */
export async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true
    }
  });
}

export async function setSession(context: BrowserContext, value: string) {
  await context.addCookies([{ name: "__session", value, domain: "localhost", path: "/", httpOnly: true }]);
}

export async function seedAdmin(uid: string, name: string, roles: string[]) {
  await admin().db.doc(`organizations/ghmo/admins/${uid}`).set({ status: "active", emailLower: `${uid}@example.org`, roles, name });
}

/** Magic link -> create passkey -> passkey session, ending on `landing`. */
export async function signInWithNewPasskey(page: Page, uid: string, landing = "/admin/encryption") {
  await addVirtualAuthenticator(page);
  await setSession(page.context(), await magicLinkSession(uid));
  await page.goto(`/admin/login?next=${encodeURIComponent(landing)}`);
  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.waitForURL(new RegExp(`${landing.replace(/\//g, "\\/")}$`), { timeout: 15_000 });
}

export function collectCspViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", m => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}
