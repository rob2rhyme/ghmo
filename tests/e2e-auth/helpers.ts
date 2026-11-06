import { expect, type BrowserContext, type Page } from "@playwright/test";
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
  await expirePublicCache();
}

/**
 * Public pages are cached as in production. Tests that write public data (events, minutes, totals) straight to
 * Firestore call this before visiting a public page, as the app's own admin writes do.
 */
export async function expirePublicCache() {
  const port = Number(process.env.E2E_AUTH_PORT ?? 3300);
  const res = await fetch(`http://localhost:${port}/api/test/expire-public-cache`).catch(() => null);
  // Before the server is up (very first reset) there is nothing cached yet.
  if (res && !res.ok) throw new Error(`Could not expire the public cache (${res.status})`);
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
  await waitForStreamedContent(page);
}

/**
 * Waits until React has moved every streamed page part into place. Parts arrive in hidden holders
 * (`<div hidden id="S:0">`) and are revealed by a script that can run just after the load event,
 * so for a moment the same text exists twice (both hidden) and text lookups fail in strict mode.
 * Seen on GitHub's runners and reproduced locally with a 6x CPU slowdown.
 */
export async function waitForStreamedContent(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0, { timeout: 15_000 });
}

export function collectCspViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", m => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  return violations;
}

/** Runs the setup wizard as a super admin on /admin/encryption. Returns the 14 recovery key groups. */
export async function turnOnEncryption(page: Page, deviceName: string, options: { passphrase?: string } = {}): Promise<string[]> {
  const { expect } = await import("@playwright/test");
  await page.goto("/admin/encryption");
  await page.getByLabel("Name this device").fill(deviceName);
  if (options.passphrase) {
    // Admins without a passkey (authenticator-app sign-in) lock this device's keys with a passphrase.
    await page.getByLabel("Encryption passphrase").fill(options.passphrase);
    await page.getByLabel("Repeat passphrase").fill(options.passphrase);
    await page.getByRole("button", { name: "Create keys with passphrase" }).click();
  } else {
    await page.getByRole("button", { name: "Create keys with my passkey" }).click();
  }
  await page.getByRole("button", { name: "Create recovery key" }).click();
  const groups = await page.getByRole("list", { name: "Recovery key groups" }).locator("li > span:last-child").allTextContents();
  expect(groups).toHaveLength(14);
  await page.getByRole("button", { name: "I have written it down" }).click();
  for (const field of await page.getByLabel(/^Group \d+$/).all()) {
    const label = await field.evaluate(el => document.querySelector(`label[for="${el.id}"]`)?.textContent ?? "");
    await field.fill(groups[Number(label.replace("Group ", "")) - 1]);
  }
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByLabel("Trustee 1", { exact: true }).fill("Trustee One");
  await page.getByLabel("Trustee 2", { exact: true }).fill("Trustee Two");
  await page.getByText("Trustee One has their own paper copy").click();
  await page.getByText("Trustee Two has their own paper copy").click();
  await page.getByRole("button", { name: "Turn on end-to-end encryption" }).click();
  await expect(page.getByText("End-to-end encryption is on", { exact: true })).toBeVisible({ timeout: 15_000 });
  return groups;
}

/**
 * `newAdmin` has just signed in with a passkey and sets up this browser as a device;
 * `approver` (an unlocked, active device) compares the safety code and approves it.
 */
export async function enrollAndApprove(approver: Page, newAdmin: Page, newAdminName: string, deviceName: string) {
  const { expect } = await import("@playwright/test");
  await newAdmin.goto("/admin/encryption");
  await newAdmin.getByLabel("Name this device").fill(deviceName);
  await newAdmin.getByRole("button", { name: "Create keys with my passkey" }).click();
  await expect(newAdmin.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  const code = (await newAdmin.getByLabel(/^Safety code /).first().textContent())!.trim();

  await approver.goto("/admin/encryption");
  // After a page load the approver is either locked (unlock first) or already showing devices.
  const unlockButton = approver.getByRole("button", { name: "Unlock with passkey" });
  await expect(unlockButton.or(approver.getByText("Devices with encryption keys"))).toBeVisible();
  if (await unlockButton.isVisible()) await unlockButton.click();
  await expect(approver.getByText("Devices waiting for approval")).toBeVisible();
  await expect(approver.getByLabel(`Safety code ${code}`).first()).toBeVisible();
  await approver.getByText(new RegExp(`I compared this code.* with ${newAdminName} and (it|both) match`)).click();
  await approver.getByRole("button", { name: "Approve device" }).click();
  await expect(approver.getByText("Devices waiting for approval")).toHaveCount(0);

  await newAdmin.getByRole("button", { name: "Check again" }).click();
  await expect(newAdmin.getByText("Devices with encryption keys")).toBeVisible();
}

/**
 * JSON for "this record must not contain X" checks. Firestore timestamps serialise as long numbers (seconds and
 * nanoseconds) that can contain any short digit string by chance, such as "555", so a check for a phone number or a
 * name must not look at them. Their numbers are replaced by a fixed word.
 */
export function plainJson(value: unknown): string {
  return JSON.stringify(value, (key, item) => (key === "_seconds" || key === "_nanoseconds" ? "time" : item));
}
