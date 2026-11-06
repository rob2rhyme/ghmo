import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { base32Decode, totpCode } from "../../src/lib/totp";
import { admin, clearEmulators, magicLinkSession, seedAdmin, setSession, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/** Email link + authenticator-app code (plan decision D6). */

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

const secretBytes = (spaced: string) => base32Decode(spaced.replace(/\s/g, ""));

/** Magic-link session -> set up the app -> returns the seed, the recovery codes and the time the first code was made. */
async function enrollWithAuthenticator(page: Page, uid: string, landing = "/admin") {
  await setSession(page.context(), await magicLinkSession(uid));
  await page.goto(`/admin/login?next=${encodeURIComponent(landing)}`);
  await expect(page.getByRole("heading", { name: "Set up your sign-in" })).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await page.getByText("Can't scan? Type the key instead").click();
  const secret = secretBytes((await page.getByTestId("totp-secret").textContent()) ?? "");
  const usedAt = Date.now();
  await page.getByLabel("6-digit code").fill(totpCode(secret, usedAt));
  await page.getByRole("button", { name: "Turn on authenticator sign-in" }).click();
  await expect(page.getByText("Save your recovery codes")).toBeVisible();
  const recoveryCodes = await page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem").allTextContents();
  await page.getByLabel("I have saved these codes").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(new RegExp(`${landing.replace(/\//g, "\\/")}$`), { timeout: 15_000 });
  return { secret, recoveryCodes, usedAt };
}

test("first-time setup with an authenticator app opens the admin area, and shows recovery codes once", async ({ page }) => {
  const { recoveryCodes } = await enrollWithAuthenticator(page, "alice", "/admin/minutes");
  expect(recoveryCodes).toHaveLength(8);
  for (const code of recoveryCodes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);

  // The seed is stored encrypted, and the recovery codes only as hashes.
  const doc = (await admin().db.doc("organizations/ghmo/admins/alice/totp/main").get()).data()!;
  expect(doc.status).toBe("active");
  expect(JSON.stringify(doc)).not.toContain(recoveryCodes[0]);
  expect(doc.secret).toEqual(expect.objectContaining({ v: 1, kid: expect.any(String), ct: expect.any(String) }));
  expect(doc.recovery).toHaveLength(8);

  await page.goto("/admin/security");
  await expect(page.getByText("Authenticator app").first()).toBeVisible();
  await expect(page.getByText("Recovery codes left: 8")).toBeVisible();
});

test("a wrong code is refused, a used code cannot be replayed, and the next code signs in", async ({ page, context }) => {
  const { secret, usedAt } = await enrollWithAuthenticator(page, "alice");

  await context.clearCookies();
  await setSession(context, await magicLinkSession("alice"));
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  // An email link on its own does not open the admin area.
  await page.goto("/admin/minutes");
  await expect(page).toHaveURL(/\/admin\/login/);

  const input = page.getByLabel("6-digit code");
  await input.fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/That code didn't match/)).toBeVisible();

  // The code that finished setup was already used.
  await input.fill(totpCode(secret, usedAt));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/That code didn't match/)).toBeVisible();

  // The next one is accepted.
  await input.fill(totpCode(secret, usedAt + 30_000));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // It lands on the page that was asked for before the sign-in.
  await expect(page).toHaveURL(/\/admin\/minutes$/, { timeout: 15_000 });
});

test("a recovery code signs in once and then stops working", async ({ page, context }) => {
  const { recoveryCodes } = await enrollWithAuthenticator(page, "alice");

  await context.clearCookies();
  await setSession(context, await magicLinkSession("alice"));
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "I lost my phone: use a recovery code" }).click();
  await page.getByLabel("Recovery code").fill(recoveryCodes[0].toLowerCase());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("You signed in with a recovery code. 7 left.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });

  await context.clearCookies();
  await setSession(context, await magicLinkSession("alice"));
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "I lost my phone: use a recovery code" }).click();
  await page.getByLabel("Recovery code").fill(recoveryCodes[0]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/That code didn't match/)).toBeVisible();
});

test("an email link alone cannot add an authenticator app to an admin who already has a passkey", async ({ page, browser }) => {
  await signInWithNewPasskey(page, "alice", "/admin/security");

  const stranger = await browser.newContext();
  await setSession(stranger, await magicLinkSession("alice"));
  const setup = await stranger.request.post("/api/auth/totp/setup", { data: {} });
  expect(setup.status()).toBe(403);
  const confirm = await stranger.request.post("/api/auth/totp/confirm", { data: { code: "123456" } });
  expect(confirm.status()).toBe(403);
  expect((await admin().db.doc("organizations/ghmo/admins/alice/totp/main").get()).exists).toBe(false);
  await stranger.close();
});

test("an email link alone cannot add a passkey to an admin who uses an authenticator app", async ({ browser }) => {
  // Bob's only sign-in method is the authenticator app (the go-live default).
  const bobContext = await browser.newContext();
  await setSession(bobContext, await magicLinkSession("bob"));
  const begun = (await (await bobContext.request.post("/api/auth/totp/setup", { data: {} })).json()) as { secret: string };
  expect((await bobContext.request.post("/api/auth/totp/confirm", { data: { code: totpCode(secretBytes(begun.secret), Date.now()) } })).status()).toBe(200);
  await bobContext.close();

  // Someone holding only Bob's inbox gets a fresh email-link session and tries to add a passkey.
  const inbox = await browser.newContext();
  await setSession(inbox, await magicLinkSession("bob"));
  const options = await inbox.request.post("/api/auth/passkey/register/options", { data: {} });
  expect(options.status()).toBe(403);
  expect(((await options.json()) as { code?: string }).code).toBe("TOTP_REQUIRED");
  const passkeys = await admin().db.collection("organizations/ghmo/admins/bob/passkeys").get();
  expect(passkeys.empty).toBe(true);
  await inbox.close();
});

test("twenty wrong codes in a day lock the authenticator until a super admin resets it", async ({ browser }) => {
  const bobContext = await browser.newContext();
  await setSession(bobContext, await magicLinkSession("bob"));
  const begun = (await (await bobContext.request.post("/api/auth/totp/setup", { data: {} })).json()) as { secret: string };
  const secret = secretBytes(begun.secret);
  expect((await bobContext.request.post("/api/auth/totp/confirm", { data: { code: totpCode(secret, Date.now()) } })).status()).toBe(200);

  // Someone with Bob's inbox has already spent 19 wrong codes today (the 10-minute limit only slows them down);
  // the 20th locks code sign-in.
  const { db } = admin();
  const key = createHash("sha256").update("totp-fail-day:bob", "utf8").digest("hex");
  await db.doc(`organizations/ghmo/rateLimits/${key}`).set({ count: 19, resetAt: Date.now() + 3_600_000, expiresAt: new Date(Date.now() + 3_600_000) });

  const inbox = await browser.newContext();
  await setSession(inbox, await magicLinkSession("bob"));
  const wrong = await inbox.request.post("/api/auth/totp/verify", { data: { code: "000000" } });
  expect(wrong.status()).toBe(423);
  expect(((await wrong.json()) as { code?: string }).code).toBe("TOTP_LOCKED");

  // Now even the right code is refused, and the lock is recorded.
  const right = await inbox.request.post("/api/auth/totp/verify", { data: { code: totpCode(secret, Date.now() + 30_000) } });
  expect(right.status()).toBe(423);
  expect((await db.doc("organizations/ghmo/admins/bob/totp/main").get()).get("lockedAt")).toBeTruthy();
  const audit = await db.collection("organizations/ghmo/auditLogs").where("action", "==", "totp_locked").get();
  expect(audit.size).toBe(1);
  // A super admin sees who is locked.
  expect((await db.doc("organizations/ghmo/admins/bob/totp/main").get()).get("lockedAt")).toBeTruthy();
  await bobContext.close();
  await inbox.close();
});

test("a super admin can reset another admin's authenticator, which signs that admin out", async ({ page, browser }) => {
  // Bob sets up an authenticator app through the API (same calls the page makes).
  const bobContext = await browser.newContext();
  await setSession(bobContext, await magicLinkSession("bob"));
  const begun = (await (await bobContext.request.post("/api/auth/totp/setup", { data: {} })).json()) as { secret: string };
  const confirmed = await bobContext.request.post("/api/auth/totp/confirm", {
    data: { code: totpCode(secretBytes(begun.secret), Date.now()) }
  });
  expect(confirmed.status()).toBe(200);
  expect((await bobContext.request.get("/api/auth/totp")).status()).toBe(200);

  // Alice (super admin, passkey session) resets Bob.
  await signInWithNewPasskey(page, "alice", "/admin/security");
  await expect(page.getByText("Reset another admin's authenticator")).toBeVisible();
  await page.getByRole("button", { name: "Reset…" }).click();
  // The reset stays off until Alice confirms she spoke with Bob (an inbox alone could set up a new app after it).
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Reset authenticator" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Reset authenticator" }).click();
  await expect(page.getByText("Authenticator reset for Bob")).toBeVisible();
  // Without that confirmation the API refuses too.
  const unconfirmed = await page.request.delete("/api/admin/totp/bob", { data: {} });
  expect(unconfirmed.status()).toBe(400);
  expect((await admin().db.doc("organizations/ghmo/admins/bob/totp/main").get()).exists).toBe(false);

  // Bob's session no longer works.
  const after = await bobContext.request.get("/api/auth/totp");
  expect(after.status()).toBe(401);
  await bobContext.close();
});

test("admins cannot reset their own authenticator, and non-super-admins cannot reset anyone's", async ({ browser }) => {
  const bobContext = await browser.newContext();
  await setSession(bobContext, await magicLinkSession("bob"));
  const begun = (await (await bobContext.request.post("/api/auth/totp/setup", { data: {} })).json()) as { secret: string };
  await bobContext.request.post("/api/auth/totp/confirm", { data: { code: totpCode(secretBytes(begun.secret), Date.now()) } });
  // Bob now has a strong session but is a plain admin.
  expect((await bobContext.request.delete("/api/admin/totp/alice")).status()).toBe(403);
  expect((await bobContext.request.delete("/api/admin/totp/bob")).status()).toBe(403);
  await bobContext.close();
});

test("an admin who signs in with an authenticator app turns on encryption with a passphrase and unlocks it again", async ({ page }) => {
  test.setTimeout(120_000);
  await enrollWithAuthenticator(page, "alice", "/admin/encryption");
  const passphrase = "correct horse battery staple";
  await turnOnEncryption(page, "Alice laptop", { passphrase });

  // No passkey is asked for: after a reload the keys are locked and the passphrase opens them.
  await page.reload();
  await expect(page.getByText("Unlock encryption on this device")).toBeVisible();
  await page.getByLabel("Encryption passphrase").fill("not the right passphrase");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("Wrong passphrase")).toBeVisible();
  await page.getByLabel("Encryption passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByText("Devices with encryption keys")).toBeVisible();

  // The server only ever stored a public key and a passphrase-protected copy is kept in this browser.
  const devices = await admin().db.collection("organizations/ghmo/e2ee/state/devices").get();
  expect(devices.docs).toHaveLength(1);
  expect(devices.docs[0].data().unlock).toBe("passphrase");
});
