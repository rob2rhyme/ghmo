import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Phase 11-A (plan §15): officer positions with term dates, and member groups with a lead. A super admin
 * seats and ends officers; any admin runs groups; the Members page shows both as badges and a filter.
 * Everything is stored in plaintext by the server, and a browser can never write it directly.
 */

const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");
const shown = (page: Page, text: string) => main(page).getByText(text, { exact: true }).filter({ visible: true });
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name, exact: true });

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const { db } = admin();
  for (const [id, name] of [["asha", "Asha Rai"], ["bina", "Bina Thapa"], ["deepak", "Deepak Gurung"]]) {
    await db.doc(`${ORG}/members/${id}`).set({ email: `${id}@example.org`, emailLower: `${id}@example.org`, name, status: "active", roles: ["member"] });
  }
});

test("several people can join a seat for several people on the same day, without ending each other", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/positions");
  await waitForStreamedContent(page);
  await expect.poll(async () => (await admin().db.collection(`${ORG}/positions`).get()).size).toBe(16);

  for (const name of ["Asha Rai", "Bina Thapa", "Deepak Gurung"]) {
    await page.getByRole("button", { name: "Set holder for Board Member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Member").selectOption({ label: name });
    await dialog.getByLabel("Starts on").fill("2026-01-01");
    // Adding alongside is the default for a seat that allows several people: the "end the others" box starts unticked.
    const endOthers = dialog.getByRole("checkbox", { name: /the day before/ });
    if (await endOthers.count()) await expect(endOthers).not.toBeChecked();
    await dialog.getByRole("button", { name: "Save holder" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect.poll(async () => (await admin().db.collection(`${ORG}/positionTerms`).get()).size).toBe(3);
  const terms = (await admin().db.collection(`${ORG}/positionTerms`).get()).docs.map(d => d.data() as { positionId: string; endsOn: string | null });
  expect(terms.every(t => t.positionId === "board_member" && t.endsOn === null)).toBe(true);
});

test("a super admin seats an officer, replaces them, and the old term moves to the past", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/positions");
  await waitForStreamedContent(page);
  await expect(main(page).getByRole("heading", { name: "Officer positions" })).toBeVisible();
  const { db } = admin();
  // The standard positions appear the first time anyone opens the page.
  await expect.poll(async () => (await db.collection(`${ORG}/positions`).get()).size).toBe(16);
  const president = main(page).getByRole("listitem").filter({ hasText: "President" }).filter({ hasNotText: "Vice" }).first();
  await expect(president.getByText("Vacant")).toBeVisible();

  // Asha has been president since 2024.
  await page.getByRole("button", { name: "Set holder for President" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Member").selectOption({ label: "Asha Rai" });
  await dialog.getByLabel("Starts on").fill("2024-01-01");
  await dialog.getByRole("button", { name: "Save holder" }).click();
  await expect(main(page).getByText("Asha Rai", { exact: true })).toBeVisible();
  await expect(president.getByText("Vacant")).toHaveCount(0);

  // Bina takes over today; Asha is ended the day before.
  await page.getByRole("button", { name: "Set holder for President" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Member").selectOption({ label: "Bina Thapa" });
  await expect(dialog.getByText(/End Asha Rai the day before/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save holder" }).click();
  await expect(main(page).getByText("Bina Thapa", { exact: true })).toBeVisible();
  await expect(main(page).getByText("Asha Rai", { exact: true })).toHaveCount(0);

  const terms = (await db.collection(`${ORG}/positionTerms`).get()).docs.map(d => ({ id: d.id, ...(d.data() as { memberId: string; startsOn: string; endsOn: string | null }) }));
  expect(terms).toHaveLength(2);
  const asha = terms.find(t => t.memberId === "asha")!;
  const bina = terms.find(t => t.memberId === "bina")!;
  expect(bina.endsOn).toBeNull();
  expect(asha.endsOn).not.toBeNull();
  expect(asha.endsOn! < bina.startsOn).toBe(true);

  await page.getByRole("button", { name: /^Past terms/ }).click();
  await expect(main(page).getByText(/^President · Jan 2024 – /)).toBeVisible();

  // The same person cannot hold the seat twice, and a bad date is refused in plain words.
  await page.getByRole("button", { name: "Current", exact: true }).click();
  await page.getByRole("button", { name: "Set holder for President" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Member").selectOption({ label: "Bina Thapa" });
  await dialog.getByRole("button", { name: "Save holder" }).click();
  await expect(page.getByText(/already hold President/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Ending a term today moves it to the past.
  await page.getByRole("button", { name: "End Bina Thapa's term as President" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End term" }).click();
  // A term runs through its end date, so Bina still holds the seat today and the row says until when.
  await expect(president.getByText(/until /)).toBeVisible();
  const endedToday = (await db.collection(`${ORG}/positionTerms`).doc(bina.id).get()).get("endsOn") as string;
  expect(endedToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(endedToday >= bina.startsOn).toBe(true);

  // Audit: counts and titles, one line per change.
  const actions = (await db.collection(`${ORG}/auditLogs`).get()).docs.map(d => d.get("action"));
  expect(actions.filter(a => a === "position_term_added")).toHaveLength(2);
  expect(actions).toContain("position_term_updated");

  // A custom position can be added and used.
  await page.getByRole("button", { name: "Add a position" }).click();
  await page.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Kitchen coordinator");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(shown(page, "Kitchen coordinator")).toBeVisible();
});

test("groups: create, add people, choose a lead, and see them on the Members page; a super admin deletes", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/groups");
  await waitForStreamedContent(page);
  const { db } = admin();
  // The phone tree callers group is there from the start.
  await expect(main(page).getByRole("link", { name: "Phone tree callers" })).toBeVisible();

  await page.getByRole("button", { name: "New group" }).click();
  await page.getByRole("dialog").getByLabel("Group name").fill("Cooking team");
  await page.getByRole("dialog").getByRole("button", { name: "Create group" }).click();
  await expect(main(page).getByRole("heading", { name: "Cooking team" })).toBeVisible();
  await expect(shown(page, "No lead yet")).toBeVisible();

  await page.getByRole("button", { name: "Add people" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Asha Rai").check();
  await dialog.getByLabel("Bina Thapa").check();
  await dialog.getByRole("button", { name: "Add 2 people" }).click();
  await expect(main(page).getByRole("heading", { name: "People (2)" })).toBeVisible();

  // The lead must already be in the group, and cannot be removed until another lead is chosen.
  await page.getByRole("button", { name: "Make Asha Rai the lead" }).click();
  await expect(shown(page, "Lead")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Asha Rai from the group" })).toBeDisabled();
  const group = (await db.collection(`${ORG}/groups`).where("name", "==", "Cooking team").get()).docs[0];
  expect(group.get("leadMemberId")).toBe("asha");
  const groupId = group.id;
  expect((await db.doc(`${ORG}/members/asha`).get()).get("groupIds")).toEqual([groupId]);

  await page.getByRole("button", { name: "Remove Bina Thapa from the group" }).click();
  await expect(main(page).getByRole("heading", { name: "People (1)" })).toBeVisible();
  expect((await db.doc(`${ORG}/members/bina`).get()).get("groupIds") ?? []).toEqual([]);

  // Members page: the badge, the filter, and the per-person Groups dialog.
  await nav(page, "Members").click();
  const asha = main(page).getByRole("listitem").filter({ hasText: "Asha Rai" });
  await expect(asha.getByText("Cooking team", { exact: true })).toBeVisible();
  await main(page).getByLabel("Filter by group").selectOption({ label: "Cooking team" });
  await expect(main(page).getByRole("listitem").filter({ hasText: "Bina Thapa" })).toHaveCount(0);
  await expect(asha).toBeVisible();
  await main(page).getByLabel("Filter by group").selectOption("none");
  await expect(main(page).getByRole("listitem").filter({ hasText: "Asha Rai" })).toHaveCount(0);
  await expect(main(page).getByRole("listitem").filter({ hasText: "Bina Thapa" })).toBeVisible();
  await page.getByRole("button", { name: "Groups for Bina Thapa" }).click();
  await page.getByRole("dialog").getByLabel("Cooking team").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save groups" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // She is in a group now, so the "In no group" filter no longer lists her; show everyone again.
  await expect(main(page).getByRole("listitem").filter({ hasText: "Bina Thapa" })).toHaveCount(0);
  await main(page).getByLabel("Filter by group").selectOption("any");
  await expect(main(page).getByRole("listitem").filter({ hasText: "Bina Thapa" }).getByText("Cooking team", { exact: true })).toBeVisible();
  expect((await db.doc(`${ORG}/members/bina`).get()).get("groupIds")).toEqual([groupId]);

  // Deleting the group takes it off everyone; the built-in callers group cannot be deleted.
  await page.goto(`/admin/groups/${groupId}`);
  await waitForStreamedContent(page);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete group" }).click();
  await expect(main(page).getByRole("heading", { name: "Groups" }).first()).toBeVisible();
  await expect.poll(async () => (await db.doc(`${ORG}/members/asha`).get()).get("groupIds") ?? []).toEqual([]);
  expect((await db.doc(`${ORG}/members/bina`).get()).get("groupIds") ?? []).toEqual([]);
  await page.goto("/admin/groups/phone_tree_callers");
  await waitForStreamedContent(page);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  const refused = await page.request.delete("/api/admin/groups/phone_tree_callers");
  expect(refused.status()).toBe(409);
});

test("an admin who is not a super admin runs groups but cannot change positions or delete a group", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "bob", "/admin/positions");
  await waitForStreamedContent(page);
  await expect(main(page).getByText(/Only a super admin can change them/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Set holder for/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a position" })).toHaveCount(0);

  const addPosition = await page.request.post("/api/admin/positions", { data: { title: "Sneaky" } });
  expect(addPosition.status()).toBe(403);
  const seat = await page.request.post("/api/admin/positions/president/terms", { data: { memberId: "asha", startsOn: "2025-01-01" } });
  expect(seat.status()).toBe(403);

  // Any admin can make a group and fill it.
  const made = await page.request.post("/api/admin/groups", { data: { name: "Marketing" } });
  expect(made.status()).toBe(201);
  const { group } = (await made.json()) as { group: { id: string } };
  const added = await page.request.post(`/api/admin/groups/${group.id}/members`, { data: { add: ["asha"] } });
  expect(added.status()).toBe(200);
  const duplicate = await page.request.post("/api/admin/groups", { data: { name: "  marketing " } });
  expect(duplicate.status()).toBe(409);
  const unknown = await page.request.post(`/api/admin/groups/${group.id}/members`, { data: { add: ["nobody"] } });
  expect(unknown.status()).toBe(404);
  const deleted = await page.request.delete(`/api/admin/groups/${group.id}`);
  expect(deleted.status()).toBe(403);
});
