import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Minutes for any meeting (plan §26, 19-A): draft minutes move to another past meeting without minutes, taking its
 * title and date; anything else is refused in plain words; the activity log names both meetings.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const day = (iso: string) => new Date(iso);

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["admin"]);
  const event = (title: string, startsAt: Date, status = "published") => ({ title, startsAt, status, body: "", createdAt: new Date() });
  await db.doc(`${ORG}/events/e1`).set(event("Wrong meeting", day("2026-10-01T23:00:00Z")));
  await db.doc(`${ORG}/events/e2`).set(event("Board call", day("2026-10-05T23:00:00Z"), "draft"));
  await db.doc(`${ORG}/events/e3`).set(event("Has minutes", day("2026-10-09T23:00:00Z")));
  await db.doc(`${ORG}/events/e4`).set(event("Next month", day("2099-01-01T23:00:00Z")));
  const minutes = (eventId: string, eventTitle: string, status: string) => ({ eventId, eventTitle, eventDate: day("2026-10-01T23:00:00Z"), meetingType: "board", status, agenda: ["Budget"], createdAt: new Date(), updatedAt: new Date() });
  await db.doc(`${ORG}/minutes/m1`).set(minutes("e1", "Wrong meeting", "draft"));
  await db.doc(`${ORG}/minutes/m3`).set(minutes("e3", "Has minutes", "approved"));
});

test("draft minutes move to the right meeting; every guard holds", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/minutes");
  const move = (id: string, eventId: string) => page.request.post("/api/admin/minutes/move", { data: { id, eventId } });

  // Refusals, each in words, and nothing changes.
  for (const [id, eventId, status, words] of [
    ["m1", "e3", 409, "already has minutes"],
    ["m1", "e4", 400, "already happened"],
    ["m1", "e1", 400, "already belong"],
    ["m1", "nope", 404, "wasn't found"],
    ["m3", "e2", 409, "Return them to draft"],
    ["zz", "e2", 404, "not found"]
  ] as const) {
    const res = await move(id, eventId);
    expect(res.status(), `${id} → ${eventId}`).toBe(status);
    expect((await res.json()).error).toContain(words);
  }
  expect((await db.doc(`${ORG}/minutes/m1`).get()).get("eventId")).toBe("e1");

  // The move: the new meeting's title and date come along; the content stays.
  const res = await move("m1", "e2");
  expect(res.status()).toBe(200);
  const moved = (await db.doc(`${ORG}/minutes/m1`).get()).data()!;
  expect(moved).toMatchObject({ eventId: "e2", eventTitle: "Board call", status: "draft", agenda: ["Budget"] });
  expect(moved.eventDate.toDate().toISOString()).toBe("2026-10-05T23:00:00.000Z");
  // e1 is free again.
  expect((await move("m1", "e1")).status()).toBe(200);

  const entries = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "minutes_moved").get()).docs.map(d => d.get("resource.summary"));
  expect(entries).toEqual(expect.arrayContaining(["Moved minutes from Wrong meeting to Board call", "Moved minutes from Board call to Wrong meeting"]));
});

const yesterdayInNewYork = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 24 * 3600_000));

test("on a new site, Write minutes offers to record the meeting; it stays a draft and the minutes save against it", async ({ page }) => {
  test.setTimeout(120_000);
  for (const doc of (await db.collection(`${ORG}/events`).get()).docs) await doc.ref.delete();
  for (const doc of (await db.collection(`${ORG}/minutes`).get()).docs) await doc.ref.delete();
  await signInWithNewPasskey(page, "alice", "/admin/minutes");
  await page.goto("/admin/minutes?mode=new");

  const dialog = page.getByRole("dialog", { name: "Record a meeting that isn't listed" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Record meeting" })).toBeDisabled();
  await dialog.getByLabel("Meeting title").fill("Board call");
  await dialog.getByLabel("Date").fill(yesterdayInNewYork());
  await dialog.getByLabel("Start time").fill("18:30");
  await dialog.getByLabel("Place (optional)").fill("Phone");
  await dialog.getByRole("button", { name: "Record meeting" }).click();
  await expect(dialog).toHaveCount(0);

  const events = (await db.collection(`${ORG}/events`).get()).docs;
  expect(events).toHaveLength(1);
  expect(events[0].data()).toMatchObject({ title: "Board call", status: "draft", location: "Phone" });
  await expect(page.locator("select").first()).toHaveValue(events[0].id);

  await page.getByPlaceholder("Summarize the discussion").fill("Agreed the hall booking.");
  await page.getByRole("button", { name: "Save Minutes" }).click();
  await expect(page.getByText("Meeting minutes saved")).toBeVisible();
  const [minutes] = (await db.collection(`${ORG}/minutes`).get()).docs;
  expect(minutes.data()).toMatchObject({ eventId: events[0].id, eventTitle: "Board call", status: "draft" });

  // A draft meeting never reaches the public Events page.
  await page.goto("/c/ghmo/events");
  await expect(page.getByText("Board call")).toHaveCount(0);
});

test("the picker marks meetings with minutes, offers a meeting on the same day, and moves a draft", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/minutes");
  await page.goto("/admin/minutes?mode=new");
  const picker = page.locator("select").first();
  await expect(picker.locator('option[value="e3"]')).toHaveText(/has minutes$/);
  await expect(picker.locator('option[value="e3"]')).toBeDisabled();
  await expect(picker.locator('option[value="e2"]')).toBeEnabled();
  await expect(picker.locator('option[value="e4"]')).toHaveCount(0);

  // Recording a meeting on a day that already has one offers that one instead.
  await page.getByRole("button", { name: "Record a meeting that isn't listed" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a meeting that isn't listed" });
  await dialog.getByLabel("Date").fill("2026-10-05");
  await expect(dialog.getByTestId("same-day")).toContainText("Board call");
  await dialog.getByRole("button", { name: "Use this meeting" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(picker).toHaveValue("e2");
  expect((await db.collection(`${ORG}/events`).get()).size).toBe(4);

  // Draft minutes on the wrong meeting are moved without losing what was written.
  await page.goto("/admin/minutes?mode=new&minutesId=m1");
  await page.getByRole("button", { name: "Change meeting…" }).click();
  const change = page.getByRole("dialog", { name: "Change meeting" });
  await change.getByLabel("Move to").selectOption("e2");
  await change.getByRole("button", { name: "Move minutes" }).click();
  await expect(change).toHaveCount(0);
  await expect(page.getByText("Minutes moved to the other meeting.")).toBeVisible();
  expect((await db.doc(`${ORG}/minutes/m1`).get()).data()).toMatchObject({ eventId: "e2", eventTitle: "Board call", agenda: ["Budget"] });

  // Approved minutes can't be moved from here.
  await page.goto("/admin/minutes?mode=new&minutesId=m3");
  await expect(page.getByText("To move these minutes to another meeting, return them to draft first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change meeting…" })).toHaveCount(0);
});
