import { expect, test } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Deleting a member (plan §20, 15-A): a super admin only, with the name typed to confirm. It removes the record and what
 * points at the member, leaves other people's rows alone, keeps officer terms as history, keeps a do-not-email record for
 * someone who had opted out, and writes an activity entry without a name or email.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
// Neutral ids: the activity entry holds the member id by design, so an id that spelled the name would trip the "no name" check.
const MAYA = "mem0001";
const OTHER = "mem0002";

async function seed() {
  await db.doc(`${ORG}/members/${MAYA}`).set({ name: "Maya Gurung", email: "maya@example.org", emailLower: "maya@example.org", status: "active", roles: ["member"], groupIds: ["g1"], emailOptOutAt: new Date("2026-02-03T04:05:06Z"), hasPhone: true });
  await db.doc(`${ORG}/members/${OTHER}`).set({ name: "Other Person", email: "other@example.org", emailLower: "other@example.org", status: "active", roles: ["member"], groupIds: ["g1"] });
  for (const id of ["n1", "n2"]) await db.doc(`${ORG}/members/${MAYA}/notes/${id}`).set({ enc: { v: 1 }, authorUid: "alice", authorName: "Alice", createdAt: new Date() });
  await db.doc(`${ORG}/members/${OTHER}/notes/n9`).set({ enc: { v: 1 }, authorUid: "alice", authorName: "Alice", createdAt: new Date() });
  await db.doc(`${ORG}/callingTree/current/assignments/${MAYA}`).set({ callerUid: "alice", assignedAt: new Date(), assignedBy: "auto" });
  await db.doc(`${ORG}/callingTree/current/assignments/${OTHER}`).set({ callerUid: "alice", assignedAt: new Date(), assignedBy: "auto" });
  await db.doc(`${ORG}/callCampaigns/c1`).set({ title: "Hall meeting", status: "closed", createdAt: new Date() });
  await db.doc(`${ORG}/callCampaigns/c1/calls/${MAYA}`).set({ callerUid: "alice", outcome: "reached", rsvp: "yes", attempts: [{ id: "a1", at: new Date(), outcome: "reached", byUid: "alice" }, { id: "a2", at: new Date(), outcome: "reached", byUid: "alice" }] });
  await db.doc(`${ORG}/callCampaigns/c1/calls/${OTHER}`).set({ callerUid: "alice", outcome: null, rsvp: null, attempts: [] });
  await db.doc(`${ORG}/broadcasts/b1`).set({ subject: "Hello", status: "sent", createdAt: new Date() });
  await db.doc(`${ORG}/broadcasts/b1/deliveries/${MAYA}`).set({ state: "sent" });
  await db.doc(`${ORG}/broadcasts/b1/deliveries/${OTHER}`).set({ state: "sent" });
  await db.doc(`${ORG}/eventTaskReminders/e1~${MAYA}`).set({ eventId: "e1", memberId: MAYA, count: 1 });
  await db.doc(`${ORG}/eventTaskReminders/digest~${MAYA}`).set({ kind: "digest", memberId: MAYA });
  await db.doc(`${ORG}/eventTaskReminders/e1~${OTHER}`).set({ eventId: "e1", memberId: OTHER, count: 1 });
  await db.doc(`${ORG}/eventTasks/t1`).set({ eventId: "e1", title: "Book hall", status: "open", memberIds: [MAYA, OTHER] });
  await db.doc(`${ORG}/groups/g1`).set({ name: "Cooking", leadMemberId: MAYA, active: true, builtIn: false });
  await db.doc(`${ORG}/positionTerms/pt1`).set({ positionId: "treasurer", memberId: MAYA, startsOn: "2024-01-01", endsOn: null, note: "" });
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seed();
});

test("a plain admin is refused, and nothing changes", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/members");
  expect((await page.request.get(`/api/organizations/ghmo/members/${MAYA}/deletion`)).status()).toBe(403);
  expect((await page.request.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: { confirm: "Maya Gurung" } })).status()).toBe(403);
  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(true);
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_deleted").get()).size).toBe(0);
});

test("a super admin sees a preview, a wrong name does nothing, and the right name removes the member and what points at them", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const api = page.request;

  // --- Preview: counts and the text to type; reads only ---
  const preview = await (await api.get(`/api/organizations/ghmo/members/${MAYA}/deletion`)).json();
  expect(preview.confirmWith).toBe("Maya Gurung");
  expect(preview.counts).toEqual({ notes: 2, assignment: 1, callRows: 1, callAttempts: 2, deliveries: 1, reminders: 2, tasks: 1, groupsLed: 1, groups: 1, officerTerms: 1 });
  expect(preview.removed.join("\n")).toContain("2 notes");
  expect(preview.kept.join("\n")).toContain("1 officer term stay as history");
  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(true);
  expect((await api.get(`/api/organizations/ghmo/members/nobody1/deletion`)).status()).toBe(404);

  // --- A wrong or missing confirmation does nothing ---
  for (const confirm of ["Maya", "maya@example.org", ""]) {
    const res = await api.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: { confirm } });
    expect(res.status(), confirm).toBe(400);
  }
  expect((await api.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: {} })).status()).toBe(400);
  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(true);
  expect((await db.collection(`${ORG}/members/${MAYA}/notes`).get()).size).toBe(2);

  // --- The right name (case and spacing ignored) ---
  const done = await api.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: { confirm: "  maya   GURUNG " } });
  expect(done.status()).toBe(200);
  const body = await done.json();
  expect(body.counts.notes).toBe(2);
  expect(body.suppressionKept).toBe("opted_out");

  expect((await db.doc(`${ORG}/members/${MAYA}`).get()).exists).toBe(false);
  expect((await db.collection(`${ORG}/members/${MAYA}/notes`).get()).size).toBe(0);
  expect((await db.doc(`${ORG}/callingTree/current/assignments/${MAYA}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/callCampaigns/c1/calls/${MAYA}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/broadcasts/b1/deliveries/${MAYA}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/eventTaskReminders/e1~${MAYA}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/eventTaskReminders/digest~${MAYA}`).get()).exists).toBe(false);
  expect((await db.doc(`${ORG}/eventTasks/t1`).get()).get("memberIds")).toEqual([OTHER]);
  expect((await db.doc(`${ORG}/groups/g1`).get()).get("leadMemberId")).toBeNull();

  // --- Other people's rows are untouched; officer terms stay as history ---
  expect((await db.doc(`${ORG}/members/${OTHER}`).get()).exists).toBe(true);
  expect((await db.collection(`${ORG}/members/${OTHER}/notes`).get()).size).toBe(1);
  expect((await db.doc(`${ORG}/callingTree/current/assignments/${OTHER}`).get()).exists).toBe(true);
  expect((await db.doc(`${ORG}/callCampaigns/c1/calls/${OTHER}`).get()).exists).toBe(true);
  expect((await db.doc(`${ORG}/broadcasts/b1/deliveries/${OTHER}`).get()).exists).toBe(true);
  expect((await db.doc(`${ORG}/eventTaskReminders/e1~${OTHER}`).get()).exists).toBe(true);
  expect((await db.doc(`${ORG}/positionTerms/pt1`).get()).get("memberId")).toBe(MAYA);

  // --- A do-not-email record holds a hash, never the address; the activity entry holds no name or email ---
  const suppressions = await db.collection(`${ORG}/emailSuppressions`).get();
  expect(suppressions.size).toBe(1);
  expect(plainJson(suppressions.docs[0].data())).not.toMatch(/maya/i);
  expect(suppressions.docs[0].id).toMatch(/^[0-9a-f]{64}$/);
  expect(suppressions.docs[0].id).not.toContain("maya");
  const logged = await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_deleted").get();
  expect(logged.size).toBe(1);
  const entry = plainJson(logged.docs[0].data());
  expect(entry).not.toMatch(/Maya|Gurung|maya@/i);
  expect(logged.docs[0].data()).toMatchObject({ actor: { uid: "alice" }, resource: { type: "member", id: MAYA }, after: { notes: 2, callRows: 1, suppressionKept: "opted_out" } });

  // --- Running it again is a clean 404, not an error ---
  expect((await api.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: { confirm: "Maya Gurung" } })).status()).toBe(404);
});

test("an address that had opted out starts opted out again when it is added or imported", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const api = page.request;
  // A second person whose address bounced.
  await db.doc(`${ORG}/members/sam1`).set({ name: "Sam Lee", email: "sam@example.org", emailLower: "sam@example.org", status: "active", roles: ["member"], emailBounced: true });
  expect((await api.delete(`/api/organizations/ghmo/members/${MAYA}`, { data: { confirm: "Maya Gurung" } })).status()).toBe(200);
  expect((await api.delete(`/api/organizations/ghmo/members/sam1`, { data: { confirm: "Sam Lee" } })).status()).toBe(200);

  // Added again by hand, with fresh consent: still opted out (the opt-out wins until an admin records consent again).
  const added = await api.post("/api/organizations/ghmo/members", { data: { email: "Maya@Example.org", name: "Maya Gurung", emailConsent: { source: "admin_on_request" } } });
  expect(added.status()).toBe(201);
  const maya = (await db.collection(`${ORG}/members`).where("emailLower", "==", "maya@example.org").get()).docs[0].data();
  expect(maya.emailOptOutAt).toBeTruthy();
  expect(maya.emailOptOutAt.toDate().toISOString()).toBe("2026-02-03T04:05:06.000Z");

  // Imported again: a bounced address stays bounced; an unrelated address is normal.
  const imported = await api.post("/api/organizations/ghmo/members/import", { data: { rows: [{ email: "sam@example.org", name: "Sam Lee" }, { email: "fresh@example.org", name: "Fresh One" }], attested: true } });
  expect(imported.status()).toBe(201);
  const sam = (await db.collection(`${ORG}/members`).where("emailLower", "==", "sam@example.org").get()).docs[0].data();
  expect(sam.emailBounced).toBe(true);
  const fresh = (await db.collection(`${ORG}/members`).where("emailLower", "==", "fresh@example.org").get()).docs[0].data();
  expect(fresh.emailOptOutAt).toBeUndefined();
  expect(fresh.emailBounced).toBeUndefined();
});
