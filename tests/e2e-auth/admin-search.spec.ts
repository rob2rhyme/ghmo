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

test("Ctrl+K finds members, events, minutes and broadcasts by name, and Enter opens them", async ({ page }) => {
  test.setTimeout(120_000);
  for (let i = 1; i <= 6; i += 1) await db.doc(`${ORG}/members/tp${i}`).set({ name: `Test Person ${i}`, emailLower: `tp${i}@example.org`, status: "active", roles: ["member"] });
  await signInWithNewPasskey(page, "bob", "/admin");
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("combobox", { name: "Search" });
  const results = page.getByRole("listbox", { name: "Results" });
  const open = async (text: string) => {
    await page.waitForLoadState("networkidle");
    await page.mouse.move(0, 0);
    await page.keyboard.press("Control+k");
    // fill() puts the cursor in the box, so keys after it go to the search even if the page moved focus on load.
    await expect(search).toBeVisible();
    await search.fill(text);
  };

  // A member by part of a name: the Members group lists her, and her position shows under Positions.
  await open("asha");
  await expect(results.getByRole("group", { name: "Members" }).getByRole("option", { name: /Asha Rai/ })).toBeVisible();
  await expect(results.getByRole("group", { name: "Positions" }).getByRole("option", { name: /Treasurer/ })).toBeVisible();
  await expect(results.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/members\/mem1$/);
  await page.goto("/admin");

  // A word in an event's title finds the event, its minutes and a broadcast; a click opens the broadcast.
  await open("picnic");
  await expect(results.getByRole("group", { name: "Events" }).getByRole("option", { name: /Summer picnic/ })).toBeVisible();
  await expect(results.getByRole("group", { name: "Minutes" }).getByRole("option", { name: /Summer picnic.*Draft/ })).toBeVisible();
  await results.getByRole("group", { name: "Broadcasts" }).getByRole("option", { name: /Picnic invitation/ }).click();
  await expect(page).toHaveURL(/\/admin\/broadcasts\/b1$/);
  await page.goto("/admin");

  // By email, and a turned-off member is marked.
  await open("bina@");
  await expect(results.getByRole("option", { name: /Bina Thapa.*Turned off/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // More than five matches: "See all" opens the Members list with the search filled in.
  await open("test person");
  await expect(results.getByRole("group", { name: "Members" }).getByRole("option")).toHaveCount(6);
  await results.getByRole("option", { name: "See all 6 matching members" }).click();
  await expect(page).toHaveURL(/\/admin\/members\?q=test%20person$/);
  await expect(page.getByRole("searchbox", { name: "Search members" }).or(page.getByLabel("Search members"))).toHaveValue("test person");

  // A plain admin never sees super-admin pages in the results.
  await open("admins");
  await expect(results.getByRole("group", { name: "Pages" }).getByRole("option", { name: /^Admins/ })).toHaveCount(0);
});
