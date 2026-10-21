import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as loginOptions } from "@/app/api/auth/passkey/login/options/route";
import { POST as loginVerify } from "@/app/api/auth/passkey/login/verify/route";
import { POST as registerOptions } from "@/app/api/auth/passkey/register/options/route";
import { POST as registerVerify } from "@/app/api/auth/passkey/register/verify/route";
import { DELETE as removePasskey, POST as approvePasskey } from "@/app/api/admin/passkeys/[ownerUid]/[credentialId]/route";
import { GET as listPasskeys } from "@/app/api/admin/passkeys/route";
import { requireActiveAdmin } from "@/src/lib/admin";
import { issueCustomToken, getAuthContextFromRequest } from "@/src/lib/auth";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebaseAdmin";
import { exchangeCustomTokenForIdToken } from "@/src/lib/firebaseAuthRest";
import { SoftAuthenticator } from "./softAuthenticator";

const ORG = "organizations/ghmo";
const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const ORIGIN = "http://localhost:3000";
let ip = 0;

async function clearEmulators() {
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

/** Session cookie as if the admin had just signed in with a magic link. */
async function magicLinkCookie(uid: string) {
  await getAdminAuth()
    .createUser({ uid })
    .catch(() => undefined);
  const idToken = await exchangeCustomTokenForIdToken(await issueCustomToken(uid, "admin", "magic_link"));
  return getAdminAuth().createSessionCookie(idToken!, { expiresIn: 60 * 60 * 1000 });
}

function req(path: string, body?: unknown, cookie?: string, method = "POST") {
  ip += 1;
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": `10.2.0.${ip % 250}` };
  if (cookie) headers.cookie = `__session=${cookie}`;
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function cookieFrom(res: Response) {
  return res.headers.getSetCookie().find(c => c.startsWith("__session="))?.split(";")[0].split("=")[1] ?? "";
}

async function registerWith(cookie: string, authenticator: SoftAuthenticator, name = "Phone") {
  const opts = await (await registerOptions(req("/api/auth/passkey/register/options", {}, cookie))).json();
  return registerVerify(
    req("/api/auth/passkey/register/verify", { challengeId: opts.challengeId, name, response: authenticator.register(opts.options.challenge) }, cookie)
  );
}

async function signInWith(authenticator: SoftAuthenticator, overrides: { userVerified?: boolean; origin?: string } = {}) {
  const opts = await (await loginOptions(req("/api/auth/passkey/login/options", {}))).json();
  return loginVerify(
    req("/api/auth/passkey/login/verify", { challengeId: opts.challengeId, response: authenticator.authenticate(opts.options.challenge, overrides) })
  );
}

beforeEach(async () => {
  await clearEmulators();
  const db = getAdminDb();
  await db.doc(`${ORG}/admins/alice`).set({ status: "active", emailLower: "alice@example.org", roles: ["super_admin"], name: "Alice" });
  await db.doc(`${ORG}/admins/bob`).set({ status: "active", emailLower: "bob@example.org", roles: ["admin"], name: "Bob" });
});

afterAll(clearEmulators);

describe("passkey policy", () => {
  it("a magic-link session cannot use admin features until a passkey is used", async () => {
    const cookie = await magicLinkCookie("alice");
    const ctx = await getAuthContextFromRequest(req("/x", undefined, cookie, "GET"));
    expect(ctx?.authMethod).toBe("magic_link");
    await expect(requireActiveAdmin(ctx!)).rejects.toMatchObject({ reason: "PASSKEY_REQUIRED" });
    expect((await listPasskeys(req("/api/admin/passkeys", undefined, cookie, "GET"))).status).toBe(403);
  });

  it("first passkey via magic link is active, and signing in with it gives a passkey session", async () => {
    const cookie = await magicLinkCookie("alice");
    const phone = new SoftAuthenticator("localhost", ORIGIN, "alice");
    const reg = await registerWith(cookie, phone);
    expect(reg.status).toBe(200);
    expect(await reg.json()).toMatchObject({ status: "active", prfEnabled: true });

    const login = await signInWith(phone);
    expect(login.status).toBe(200);
    const session = cookieFrom(login);
    const ctx = await getAuthContextFromRequest(req("/x", undefined, session, "GET"));
    expect(ctx).toMatchObject({ uid: "alice", authMethod: "passkey" });
    await expect(requireActiveAdmin(ctx!)).resolves.toMatchObject({ authMethod: "passkey" });
  });

  it("a recovery passkey added by magic link waits for another admin's approval", async () => {
    // Both admins already have passkeys.
    const alicePhone = new SoftAuthenticator("localhost", ORIGIN, "alice");
    const bobPhone = new SoftAuthenticator("localhost", ORIGIN, "bob");
    await registerWith(await magicLinkCookie("alice"), alicePhone);
    await registerWith(await magicLinkCookie("bob"), bobPhone);

    // Someone with access to Alice's email registers a new passkey.
    const attackerKey = new SoftAuthenticator("localhost", ORIGIN, "alice");
    const reg = await registerWith(await magicLinkCookie("alice"), attackerKey, "New laptop");
    expect(await reg.json()).toMatchObject({ status: "pending" });
    expect((await signInWith(attackerKey)).status).toBe(401);

    // Alice cannot approve her own key, even with a passkey session.
    const aliceSession = cookieFrom(await signInWith(alicePhone));
    const selfApprove = await approvePasskey(
      req(`/api/admin/passkeys/alice/${attackerKey.id}`, { action: "approve" }, aliceSession),
      { params: Promise.resolve({ ownerUid: "alice", credentialId: attackerKey.id }) }
    );
    expect(selfApprove.status).toBe(403);

    // Bob sees it and approves; then it works.
    const bobSession = cookieFrom(await signInWith(bobPhone));
    const list = await (await listPasskeys(req("/api/admin/passkeys", undefined, bobSession, "GET"))).json();
    expect(list.pendingApprovals.map((p: { credentialId: string }) => p.credentialId)).toContain(attackerKey.id);
    const approve = await approvePasskey(
      req(`/api/admin/passkeys/alice/${attackerKey.id}`, { action: "approve" }, bobSession),
      { params: Promise.resolve({ ownerUid: "alice", credentialId: attackerKey.id }) }
    );
    expect(approve.status).toBe(200);
    expect((await signInWith(attackerKey)).status).toBe(200);
  });

  it("with no other admin able to approve, recovery activates immediately", async () => {
    await getAdminDb().doc(`${ORG}/admins/bob`).set({ status: "disabled" }, { merge: true });
    const first = new SoftAuthenticator("localhost", ORIGIN, "alice");
    await registerWith(await magicLinkCookie("alice"), first);
    const replacement = new SoftAuthenticator("localhost", ORIGIN, "alice");
    const reg = await registerWith(await magicLinkCookie("alice"), replacement);
    expect(await reg.json()).toMatchObject({ status: "active" });
  });

  it("will not remove an admin's last active passkey", async () => {
    const phone = new SoftAuthenticator("localhost", ORIGIN, "alice");
    await registerWith(await magicLinkCookie("alice"), phone);
    const session = cookieFrom(await signInWith(phone));
    const res = await removePasskey(req(`/api/admin/passkeys/alice/${phone.id}`, undefined, session, "DELETE"), {
      params: Promise.resolve({ ownerUid: "alice", credentialId: phone.id })
    });
    expect(res.status).toBe(409);
  });
});

describe("passkey sign-in rejects bad assertions", () => {
  let phone: SoftAuthenticator;
  beforeEach(async () => {
    phone = new SoftAuthenticator("localhost", ORIGIN, "alice");
    await registerWith(await magicLinkCookie("alice"), phone);
  });

  it("without user verification (no PIN/biometric)", async () => {
    expect((await signInWith(phone, { userVerified: false })).status).toBe(401);
  });

  it("from another origin (phishing site)", async () => {
    expect((await signInWith(phone, { origin: "https://ghmo-login.example" })).status).toBe(401);
  });

  it("when a challenge is replayed", async () => {
    const opts = await (await loginOptions(req("/api/auth/passkey/login/options", {}))).json();
    const assertion = phone.authenticate(opts.options.challenge);
    const body = { challengeId: opts.challengeId, response: assertion };
    expect((await loginVerify(req("/api/auth/passkey/login/verify", body))).status).toBe(200);
    expect((await loginVerify(req("/api/auth/passkey/login/verify", body))).status).toBe(401);
  });

  it("for an unknown credential", async () => {
    const stranger = new SoftAuthenticator("localhost", ORIGIN, "alice");
    expect((await signInWith(stranger)).status).toBe(401);
  });

  it("for a disabled admin", async () => {
    await getAdminDb().doc(`${ORG}/admins/alice`).set({ status: "disabled" }, { merge: true });
    expect((await signInWith(phone)).status).toBe(401);
  });
});
