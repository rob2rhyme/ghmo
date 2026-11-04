import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, POST } from "@/app/api/auth/session/route";
import { GET as CUSTOM_TOKEN } from "@/app/api/auth/firebase-custom-token/route";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import { getAdminAuth, getAdminDb } from "@/src/lib/firebaseAdmin";

const ORG = "organizations/ghmo";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST!;
const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;
let counter = 0;

async function clearEmulators() {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
}

/** Signs a user in against the emulator and returns a fresh ID token. */
async function idTokenFor(uid: string, claims: Record<string, unknown> = {}, email?: string, emailVerified = true) {
  await getAdminAuth()
    .createUser({ uid, email, emailVerified })
    .catch(() => undefined);
  const customToken = await getAdminAuth().createCustomToken(uid, claims);
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

function postSession(idToken: unknown) {
  counter += 1;
  return POST(
    new NextRequest("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${counter}` },
      body: JSON.stringify({ idToken })
    })
  );
}

function requestWithCookie(cookie: string, method = "GET") {
  return new NextRequest("http://localhost/api/anything", { method, headers: { cookie: `__session=${cookie}` } });
}

function sessionCookieFrom(res: Response) {
  const header = res.headers.getSetCookie().find(c => c.startsWith("__session="));
  return { header, value: header?.split(";")[0].split("=")[1] ?? "" };
}

const ADMIN_CLAIMS = { orgSlug: "ghmo", role: "admin", admin: true };

beforeEach(async () => {
  await clearEmulators();
  const db = getAdminDb();
  await db.doc(`${ORG}/admins/admin-1`).set({ status: "active", emailLower: "admin@example.org", roles: ["admin"], name: "A" });
  await db.doc(`${ORG}/admins/admin-off`).set({ status: "disabled", emailLower: "off@example.org", roles: ["admin"] });
  await db.doc(`${ORG}/members/m-1`).set({ status: "active", emailLower: "member@example.org" });
});

afterAll(clearEmulators);

describe("POST /api/auth/session", () => {
  it("gives an allowlisted member a revocable, HttpOnly session cookie", async () => {
    const res = await postSession(await idTokenFor("member-uid", {}, "member@example.org"));
    expect(res.status).toBe(200);
    const { header, value } = sessionCookieFrom(res);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Max-Age=28800/);
    // It is a session cookie, not the raw ID token.
    await expect(getAdminAuth().verifySessionCookie(value, true)).resolves.toMatchObject({ uid: "member-uid" });
    // The pre-Phase-1 cookie gets cleared.
    expect(res.headers.getSetCookie().some(c => c.startsWith("sessionToken=;"))).toBe(true);
  });

  it("never makes an admin session: admin sessions come only from the server-side sign-in steps", async () => {
    const active = await postSession(await idTokenFor("admin-1", ADMIN_CLAIMS, "admin@example.org"));
    expect(active.status).toBe(403);
    expect(sessionCookieFrom(active).header).toBeUndefined();
    const disabled = await postSession(await idTokenFor("admin-off", ADMIN_CLAIMS, "off@example.org"));
    expect(disabled.status).toBe(403);
  });

  it("refuses the browser's Firestore token (it carries sessionExp), even for a member", async () => {
    const res = await postSession(await idTokenFor("member-uid", { sessionExp: Math.floor(Date.now() / 1000) + 3600 }, "member@example.org"));
    expect(res.status).toBe(401);
    expect(sessionCookieFrom(res).header).toBeUndefined();
  });

  it("can't renew an admin session: cookie -> Firestore custom token -> new cookie is refused", async () => {
    // An admin session as the server-side sign-in makes it (passkey strength).
    const idToken = await idTokenFor("admin-1", { ...ADMIN_CLAIMS, authMethod: "passkey" }, "admin@example.org");
    const cookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: 3600 * 1000 });
    const tokenRes = await CUSTOM_TOKEN(
      new NextRequest("http://localhost/api/auth/firebase-custom-token", { headers: { cookie: `__session=${cookie}` } })
    );
    expect(tokenRes.status).toBe(200);
    const { token } = (await tokenRes.json()) as { token: string };
    const signIn = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, returnSecureToken: true })
    });
    const { idToken: firestoreToken } = (await signIn.json()) as { idToken: string };
    const renewed = await postSession(firestoreToken);
    expect(renewed.status).toBeGreaterThanOrEqual(400);
    expect(sessionCookieFrom(renewed).header).toBeUndefined();
  });

  it("refuses an arbitrary Firebase user who is not on any allowlist", async () => {
    const res = await postSession(await idTokenFor("stranger", {}, "stranger@example.org"));
    expect(res.status).toBe(403);
  });

  it("refuses a forged admin claim without an admin record", async () => {
    const res = await postSession(await idTokenFor("not-in-admins", ADMIN_CLAIMS, "x@example.org"));
    expect(res.status).toBe(403);
  });

  it("accepts an allowlisted member", async () => {
    const res = await postSession(await idTokenFor("member-uid", {}, "member@example.org"));
    expect(res.status).toBe(200);
  });

  it("refuses a member whose email address is not verified", async () => {
    const res = await postSession(await idTokenFor("member-unverified", {}, "member@example.org", false));
    expect(res.status).toBe(403);
  });

  it("rejects garbage tokens", async () => {
    expect((await postSession("not-a-real-token-but-long-enough")).status).toBe(401);
    expect((await postSession(undefined)).status).toBe(400);
  });
});

describe("session verification and logout", () => {
  it("authenticates requests with the session cookie, and logout revokes it", async () => {
    // An admin session as the server-side sign-in steps make it (they call createSessionCookie directly).
    const value = await getAdminAuth().createSessionCookie(await idTokenFor("admin-1", ADMIN_CLAIMS, "admin@example.org"), {
      expiresIn: 3600 * 1000
    });

    const ctx = await getAuthContextFromRequest(requestWithCookie(value));
    expect(ctx).toMatchObject({ uid: "admin-1", orgSlug: "ghmo", role: "admin" });

    // Revocation has one-second granularity.
    await new Promise(r => setTimeout(r, 1100));
    const logout = await DELETE(requestWithCookie(value, "DELETE"));
    expect(logout.status).toBe(200);
    expect(sessionCookieFrom(logout).header).toMatch(/Max-Age=0/);

    // A copy of the cookie kept by an attacker no longer works.
    expect(await getAuthContextFromRequest(requestWithCookie(value))).toBeNull();
  });

  it("rejects a raw ID token placed in the session cookie (old format)", async () => {
    const idToken = await idTokenFor("admin-1", ADMIN_CLAIMS, "admin@example.org");
    expect(await getAuthContextFromRequest(requestWithCookie(idToken))).toBeNull();
  });
});
