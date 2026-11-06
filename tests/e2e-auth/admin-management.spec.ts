import { expect, test } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Phase 17-A: a super admin adds, turns off and on, re-roles and renames admins through the routes. A plain admin is refused,
 * nobody can lock themselves out, the last active super admin always stays (even when two super admins act at the same
 * moment), and the activity log never holds an email address.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const stateOf = async (id: string) => (await db.doc(`${ORG}/admins/${id}`).get()).data() as { status: string; roles: string[]; name: string; emailLower: string; createdBy?: string };

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["super_admin"]);
});

test("a plain admin is refused every admin-management route, and nothing changes", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/security");
  const api = page.request;
  expect((await api.get("/api/admin/admins")).status()).toBe(403);
  expect((await api.post("/api/admin/admins", { data: { name: "Eve", email: "eve@example.org", role: "super_admin" } })).status()).toBe(403);
  expect((await api.patch("/api/admin/admins/carol", { data: { status: "disabled" } })).status()).toBe(403);
  expect((await api.patch("/api/admin/admins/bob", { data: { role: "super_admin" } })).status()).toBe(403);
  expect((await db.collection(`${ORG}/admins`).get()).size).toBe(3);
  expect((await stateOf("carol")).status).toBe("active");
  expect((await stateOf("bob")).roles).toEqual(["admin"]);
});

test("a super admin lists, adds, renames, turns off and on, and re-roles admins; every guard holds", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await signInWithNewPasskey(alicePage, "alice", "/admin/security");
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await signInWithNewPasskey(bobPage, "bob", "/admin/security");
  const api = alicePage.request;

  // --- The list: super admins first, you marked ---
  const list = await (await api.get("/api/admin/admins")).json();
  expect(list.admins.map((a: { id: string }) => a.id)).toEqual(["alice", "carol", "bob"]);
  expect(list.admins[0]).toMatchObject({ role: "super_admin", active: true, isYou: true });
  expect(list.admins[2]).toMatchObject({ role: "admin", isYou: false });

  // --- Adding ---
  const added = await api.post("/api/admin/admins", { data: { name: "  Deepak   Gurung ", email: "Deepak@Example.org", role: "admin" } });
  expect(added.status()).toBe(201);
  const newId = (await added.json()).id as string;
  expect(await stateOf(newId)).toMatchObject({ status: "active", roles: ["admin"], name: "Deepak Gurung", emailLower: "deepak@example.org", createdBy: "alice" });
  // The sign-in link is sent to an address that matches an active admin record, so this record is what lets them in.
  expect((await db.collection(`${ORG}/admins`).where("emailLower", "==", "deepak@example.org").get()).docs[0].get("status")).toBe("active");
  expect((await api.post("/api/admin/admins", { data: { name: "Again", email: "DEEPAK@example.org", role: "admin" } })).status()).toBe(409);
  expect((await api.post("/api/admin/admins", { data: { name: "Eve", email: "not-an-email", role: "admin" } })).status()).toBe(400);
  expect((await api.post("/api/admin/admins", { data: { name: "", email: "eve@example.org", role: "admin" } })).status()).toBe(400);
  expect((await api.post("/api/admin/admins", { data: { name: "Eve", email: "eve@example.org", role: "owner" } })).status()).toBe(400);
  expect((await api.post("/api/admin/admins", { data: { name: "Eve", email: "eve@example.org", role: "admin", status: "active" } })).status()).toBe(400);

  // --- Renaming: a name can be fixed, an email cannot be changed ---
  expect((await api.patch(`/api/admin/admins/${newId}`, { data: { name: "Deepak G." } })).status()).toBe(200);
  expect((await stateOf(newId)).name).toBe("Deepak G.");
  expect((await api.patch(`/api/admin/admins/${newId}`, { data: { email: "other@example.org" } })).status()).toBe(400);
  expect((await stateOf(newId)).emailLower).toBe("deepak@example.org");

  // --- Turning off: access ends at once, and push devices go when asked ---
  await db.doc(`${ORG}/pushSubscriptions/${"b".repeat(32)}`).set({ uid: "bob", endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "k", auth: "a", label: "Chrome on Android", kinds: ["chat"], createdAt: new Date(), lastSentAt: null });
  await db.doc(`${ORG}/pushSubscriptions/${"c".repeat(32)}`).set({ uid: "carol", endpoint: "https://fcm.googleapis.com/fcm/send/y", p256dh: "k", auth: "a", label: "Chrome on Android", kinds: ["chat"], createdAt: new Date(), lastSentAt: null });
  expect((await bobPage.request.get("/api/admin/push")).status()).toBe(200);
  const off = await api.patch("/api/admin/admins/bob", { data: { status: "disabled", removePushDevices: true } });
  expect(off.status()).toBe(200);
  expect(await off.json()).toMatchObject({ changed: true, pushDevicesRemoved: 1, encryptionReminder: true });
  expect((await stateOf("bob")).status).toBe("disabled");
  expect((await bobPage.request.get("/api/admin/push")).status()).toBe(403);
  expect((await db.doc(`${ORG}/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/pushSubscriptions/${"c".repeat(32)}`).get()).exists).toBe(true); // someone else's device is untouched
  expect((await (await api.patch("/api/admin/admins/bob", { data: { status: "disabled" } })).json()).changed).toBe(false); // already off: nothing happens

  // --- Turning on again (devices are not brought back) ---
  const on = await api.patch("/api/admin/admins/bob", { data: { status: "active" } });
  expect(await on.json()).toMatchObject({ changed: true, encryptionReminder: false });
  expect((await stateOf("bob")).status).toBe("active");

  // --- Roles ---
  expect((await api.patch("/api/admin/admins/bob", { data: { role: "super_admin" } })).status()).toBe(200);
  expect((await stateOf("bob")).roles).toEqual(["super_admin"]);
  expect((await api.patch("/api/admin/admins/bob", { data: { role: "admin" } })).status()).toBe(200);
  expect((await stateOf("bob")).roles).toEqual(["admin"]);

  // --- Guards: not yourself ---
  const self = await api.patch("/api/admin/admins/alice", { data: { status: "disabled" } });
  expect(self.status()).toBe(409);
  expect((await self.json()).error).toContain("yourself");
  expect((await api.patch("/api/admin/admins/alice", { data: { role: "admin" } })).status()).toBe(409);
  expect((await stateOf("alice")).status).toBe("active");
  expect((await stateOf("alice")).roles).toEqual(["super_admin"]);
  expect((await api.patch("/api/admin/admins/nobody", { data: { status: "disabled" } })).status()).toBe(404);
  expect((await api.patch("/api/admin/admins/bad id!", { data: { status: "disabled" } })).status()).toBe(404);

  // --- The log: every change, and never an email address ---
  const actions = (await db.collection(`${ORG}/auditLogs`).get()).docs.map(doc => doc.get("action") as string);
  for (const action of ["admin_added", "admin_renamed", "admin_turned_off", "admin_turned_on", "admin_role_changed"]) expect(actions, action).toContain(action);
  expect(actions.filter(action => action === "admin_turned_off")).toHaveLength(1); // the no-op logged nothing
  const entries = (await db.collection(`${ORG}/auditLogs`).get()).docs.filter(doc => String(doc.get("action")).startsWith("admin_")).map(doc => doc.data());
  expect(plainJson(entries)).not.toMatch(/example\.org/);
  await aliceContext.close();
  await bobContext.close();
});

test("two super admins turning each other off at the same moment leave exactly one active", async ({ browser }) => {
  test.setTimeout(120_000);
  const aliceContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  await signInWithNewPasskey(alicePage, "alice", "/admin/security");
  const carolContext = await browser.newContext();
  const carolPage = await carolContext.newPage();
  await signInWithNewPasskey(carolPage, "carol", "/admin/security");

  const [a, c] = await Promise.all([
    alicePage.request.patch("/api/admin/admins/carol", { data: { status: "disabled" } }),
    carolPage.request.patch("/api/admin/admins/alice", { data: { status: "disabled" } })
  ]);
  // One succeeds; the other is refused (as the only active super admin left, or because its own account was just turned off).
  const statuses = [a.status(), c.status()].sort();
  expect(statuses[0]).toBe(200);
  expect([403, 409]).toContain(statuses[1]);
  const active = [(await stateOf("alice")).status, (await stateOf("carol")).status].filter(status => status === "active");
  expect(active).toHaveLength(1);
  await aliceContext.close();
  await carolContext.close();
});
