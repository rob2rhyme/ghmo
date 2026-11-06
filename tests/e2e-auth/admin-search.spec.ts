import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Search people and records (plan §27, 20-A): the palette's index holds names, titles, dates and statuses only, for
 * any active admin; nothing encrypted or private ever leaves the server through it.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const SECRET = "SECRET-TEXT-123";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("bob", "Bob", ["admin"]);
  await db.doc(`${ORG}/members/mem1`).set({ name: "Asha Rai", email: "asha@example.org", emailLower: "asha@example.org", status: "active", roles: ["member"], hasPhone: true, contact: { v: 1, ct: SECRET }, city: SECRET });
  await db.doc(`${ORG}/members/mem2`).set({ name: "Bina Thapa", emailLower: "bina@example.org", status: "disabled", roles: ["member"] });
  await db.doc(`${ORG}/members/mem1/notes/n1`).set({ enc: { ct: SECRET }, authorUid: "bob", createdAt: new Date() });
  await db.doc(`${ORG}/events/ev1`).set({ title: "Summer picnic", startsAt: new Date("2026-07-04T16:00:00Z"), status: "published", body: SECRET });
  await db.doc(`${ORG}/minutes/mn1`).set({ eventId: "ev1", eventTitle: "Summer picnic", eventDate: new Date("2026-07-04T16:00:00Z"), status: "draft", discussionSummary: SECRET, enc: { ct: SECRET } });
  await db.doc(`${ORG}/groups/g1`).set({ name: "Cooking team", active: true, description: SECRET });
  await db.doc(`${ORG}/positions/treasurer`).set({ title: "Treasurer", active: true, order: 1 });
  await db.doc(`${ORG}/positionTerms/t1`).set({ positionId: "treasurer", memberId: "mem1", startsOn: "2024-01-01", endsOn: null, note: SECRET });
  await db.doc(`${ORG}/broadcasts/b1`).set({ subject: "Picnic invitation", body: SECRET, status: "pending_approval", updatedAt: new Date() });
});

test("the search index lists people and records by name only", async ({ page }) => {
  expect((await page.request.get("/api/admin/search-index")).status()).toBe(401);
  await signInWithNewPasskey(page, "bob", "/admin");
  const res = await page.request.get("/api/admin/search-index");
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toContain(SECRET);
  const { entries } = JSON.parse(text) as { entries: { kind: string; id: string; title: string; detail?: string; badge?: string }[] };
  const find = (kind: string, id: string) => entries.find(e => e.kind === kind && e.id === id);
  expect(find("member", "mem1")).toMatchObject({ title: "Asha Rai", detail: "asha@example.org" });
  expect(find("member", "mem2")).toMatchObject({ title: "Bina Thapa", badge: "Turned off" });
  expect(find("event", "ev1")).toMatchObject({ title: "Summer picnic" });
  expect(find("minutes", "mn1")?.detail).toContain("Draft");
  expect(find("group", "g1")).toMatchObject({ title: "Cooking team" });
  expect(find("position", "treasurer")).toMatchObject({ title: "Treasurer", detail: "Asha Rai" });
  expect(find("broadcast", "b1")).toMatchObject({ title: "Picnic invitation", detail: "Waiting for approval" });
  // Reading it is not an activity-log entry.
  expect((await db.collection(`${ORG}/auditLogs`).where("route", "==", "/api/admin/search-index").get()).size).toBe(0);
});
