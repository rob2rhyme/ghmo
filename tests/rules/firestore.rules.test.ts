import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const ORG = "organizations/ghmo";
const ADMIN_CLAIMS = { orgSlug: "ghmo", role: "admin", admin: true, authMethod: "passkey" };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-ghmo",
    firestore: { rules: readFileSync("firestore.rules", "utf8") }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${ORG}/admins/active-admin`), { status: "active", emailLower: "a@example.org" });
    await setDoc(doc(db, `${ORG}/admins/disabled-admin`), { status: "disabled", emailLower: "d@example.org" });
    await setDoc(doc(db, `${ORG}/minutes/m1`), { title: "Draft minutes" });
    await setDoc(doc(db, `${ORG}/adminChatMessages/msg1`), { body: "hi" });
  });
});

const admin = () => env.authenticatedContext("active-admin", ADMIN_CLAIMS).firestore();

describe("admin access requires an active admin record", () => {
  it("lets an active admin read admin-only data", async () => {
    await assertSucceeds(getDoc(doc(admin(), `${ORG}/minutes/m1`)));
    await assertSucceeds(getDoc(doc(admin(), `${ORG}/adminChatMessages/msg1`)));
  });

  it("keeps minutes server-written: admins can read them but not write them directly", async () => {
    await assertFails(setDoc(doc(admin(), `${ORG}/minutes/m1`), { title: "Tampered" }));
    await assertFails(setDoc(doc(admin(), `${ORG}/minutes/m2`), { title: "New" }));
  });

  it("blocks a disabled admin even though the token still has the admin claim", async () => {
    const db = env.authenticatedContext("disabled-admin", ADMIN_CLAIMS).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
    await assertFails(getDoc(doc(db, `${ORG}/adminChatMessages/msg1`)));
  });

  it("keeps donation records and webhook payloads admin-only", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${ORG}/donations/stats`), { totalRaised: 5 });
      await setDoc(doc(db, `${ORG}/donations/webhookEvents/events/e1`), { donor: "Someone" });
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `${ORG}/donations/stats`)));
    await assertFails(getDoc(doc(anon, `${ORG}/donations/webhookEvents/events/e1`)));
    await assertSucceeds(getDoc(doc(admin(), `${ORG}/donations/webhookEvents/events/e1`)));
  });

  it("lets admins read audit logs but never write them", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `${ORG}/auditLogs/a1`), { action: "x" });
    });
    await assertSucceeds(getDoc(doc(admin(), `${ORG}/auditLogs/a1`)));
    await assertFails(setDoc(doc(admin(), `${ORG}/auditLogs/a1`), { action: "erased" }));
    await assertFails(setDoc(doc(admin(), `${ORG}/auditLogs/a2`), { action: "forged" }));
  });

  it("blocks a removed admin (no record) with a leftover admin claim", async () => {
    const db = env.authenticatedContext("deleted-admin", ADMIN_CLAIMS).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("blocks an admin whose token came from a magic link (no passkey yet)", async () => {
    const db = env.authenticatedContext("active-admin", { ...ADMIN_CLAIMS, authMethod: "magic_link" }).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("lets an admin whose session used an authenticator-app code read admin data", async () => {
    const db = env.authenticatedContext("active-admin", { ...ADMIN_CLAIMS, authMethod: "totp" }).firestore();
    await assertSucceeds(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("still blocks an unknown sign-in method", async () => {
    const db = env.authenticatedContext("active-admin", { ...ADMIN_CLAIMS, authMethod: "password" }).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("blocks admin tokens minted before passkeys (no authMethod claim)", async () => {
    const legacyClaims = { orgSlug: "ghmo", role: "admin", admin: true };
    const db = env.authenticatedContext("active-admin", legacyClaims).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("blocks signed-in users without the admin claim", async () => {
    const db = env.authenticatedContext("active-admin", { orgSlug: "ghmo", role: "member" }).firestore();
    await assertFails(getDoc(doc(db, `${ORG}/minutes/m1`)));
  });

  it("blocks anonymous visitors", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${ORG}/minutes/m1`)));
  });
});

describe("server-only collections", () => {
  it.each(["admins/active-admin", "admins/active-admin/passkeys/k1", "admins/active-admin/totp/main", "e2ee/state", "e2ee/state/devices/d1", "e2ee/state/wraps/1_recovery", "passkeyIndex/k1", "webauthnChallenges/c1", "rateLimits/abc", "config/bootstrap", "pins/old"])(
    "denies client access to %s, even for admins",
    async path => {
      await assertFails(getDoc(doc(admin(), `${ORG}/${path}`)));
    }
  );

  it("denies client access to signing sessions", async () => {
    await assertFails(getDoc(doc(admin(), "signingSessions/s1")));
  });
});

describe("admin chat", () => {
  it("lets an active admin post as themselves", async () => {
    await assertSucceeds(
      setDoc(doc(admin(), `${ORG}/adminChatMessages/new`), {
        body: "hello",
        createdBy: { uid: "active-admin" },
        createdAt: serverTimestamp()
      })
    );
  });

  it("rejects posting as someone else", async () => {
    await assertFails(
      setDoc(doc(admin(), `${ORG}/adminChatMessages/new`), {
        body: "hello",
        createdBy: { uid: "someone-else" },
        createdAt: serverTimestamp()
      })
    );
  });

  it("rejects editing an existing message", async () => {
    await assertFails(setDoc(doc(admin(), `${ORG}/adminChatMessages/msg1`), { body: "edited" }));
  });
});
