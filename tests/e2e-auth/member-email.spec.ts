import { expect, test } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Changing a member's email (plan §25, 18-A): super admins only; history stays with the member id; one address per
 * member; consent and opt-out stay with the person; an opted-out old address goes on the do-not-email list; the sign-in
 * link is reset; the activity entry holds neither address.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const ASHA = "mem0101";
const BINA = "mem0102";
const DEEP = "mem0103";
const url = (id: string) => `/api/organizations/ghmo/members/${id}/email`;
const member = async (id: string) => (await db.doc(`${ORG}/members/${id}`).get()).data() as Record<string, unknown>;

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const base = { status: "active", roles: ["member"] };
  await db.doc(`${ORG}/members/${ASHA}`).set({ ...base, name: "Asha Rai", email: "asha@example.org", emailLower: "asha@example.org", uid: "old-account", emailBounced: true, emailConsent: { source: "admin_on_request", at: new Date() }, groupIds: ["g1"] });
  await db.doc(`${ORG}/members/${BINA}`).set({ ...base, name: "Bina Thapa", email: "bina@example.org", emailLower: "bina@example.org", emailOptOutAt: new Date("2026-03-04T05:06:07Z"), hasPhone: true });
  await db.doc(`${ORG}/members/${DEEP}`).set({ ...base, name: "Deepak Gurung", emailLower: "", hasPhone: true });
  await db.doc(`${ORG}/members/${ASHA}/notes/n1`).set({ enc: { v: 1 }, authorUid: "alice", authorName: "Alice", createdAt: new Date() });
  await db.doc(`${ORG}/positionTerms/pt1`).set({ positionId: "treasurer", memberId: ASHA, startsOn: "2024-01-01", endsOn: null, note: "" });
});

test("a plain admin can't change an email", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/members");
  const res = await page.request.put(url(ASHA), { data: { email: "new@example.org" } });
  expect(res.status()).toBe(403);
  expect((await member(ASHA)).emailLower).toBe("asha@example.org");
});

test("a super admin changes, adds and removes addresses; every guard holds", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const api = page.request;

  // --- Change: history stays, consent stays, the old bounce and the sign-in link are cleared ---
  let res = await api.put(url(ASHA), { data: { email: "Asha.Rai@Example.org" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, kind: "changed", oldKept: true });
  const asha = await member(ASHA);
  expect(asha).toMatchObject({ email: "Asha.Rai@Example.org", emailLower: "asha.rai@example.org", uid: null, emailBounced: false, groupIds: ["g1"] });
  expect(asha.emailConsent).toBeTruthy();
  expect((await db.collection(`${ORG}/members/${ASHA}/notes`).get()).size).toBe(1);
  expect((await db.doc(`${ORG}/positionTerms/pt1`).get()).get("memberId")).toBe(ASHA);

  // --- Bad input and duplicates are refused in plain words ---
  expect((await api.put(url(ASHA), { data: { email: "not-an-address" } })).status()).toBe(400);
  expect((await api.put(url(ASHA), { data: { email: "Asha.Rai@Example.org" } })).status()).toBe(400);
  res = await api.put(url(ASHA), { data: { email: "BINA@example.org" } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toContain("Bina Thapa already uses this address");
  expect((await api.put(url("nobody1"), { data: { email: "x@example.org" } })).status()).toBe(404);
  // Adding a member at a used address is refused too.
  res = await api.post("/api/organizations/ghmo/members", { data: { email: "asha.rai@example.org", name: "Someone Else" } });
  expect(res.status()).toBe(409);

  // --- Bina opted out: she stays opted out, and her old address goes on the do-not-email list ---
  res = await api.put(url(BINA), { data: { email: "bina.new@example.org" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).oldKept).toBe(true);
  const bina = await member(BINA);
  expect((bina.emailOptOutAt as { toDate: () => Date }).toDate().toISOString()).toBe("2026-03-04T05:06:07.000Z");
  expect((await db.collection(`${ORG}/emailSuppressions`).get()).size).toBe(2); // Asha's bounced address and Bina's
  // Giving that old address to Deepak starts him opted out, with Bina's opt-out time.
  res = await api.put(url(DEEP), { data: { email: "bina@example.org" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).kind).toBe("added");
  const deep = await member(DEEP);
  expect(deep.emailLower).toBe("bina@example.org");
  expect((deep.emailOptOutAt as { toDate: () => Date }).toDate().toISOString()).toBe("2026-03-04T05:06:07.000Z");

  // --- Removing: only when a name and a phone number remain ---
  res = await api.put(url(ASHA), { data: { email: "" } });
  expect(res.status()).toBe(400);
  res = await api.put(url(BINA), { data: { email: "" } });
  expect(res.status()).toBe(200);
  expect(await member(BINA)).toMatchObject({ email: null, emailLower: "" });

  // --- Activity: one entry per change, with neither address ---
  const entries = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_email_changed").get()).docs.map(d => plainJson(d.data()));
  expect(entries).toHaveLength(4);
  for (const entry of entries) {
    // The actor (Alice) is named, as in every entry; the members' names and addresses never are.
    expect(entry).not.toMatch(/asha|bina|deepak/i);
  }
});
