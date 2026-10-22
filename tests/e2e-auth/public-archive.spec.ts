import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  const { db } = admin();
  const now = Timestamp.now();
  const base = { eventTitle: "Spring board meeting", meetingType: "Board", recordedBy: "Alice", createdAt: now, eventDate: Timestamp.fromMillis(Date.UTC(2026, 2, 14)) };
  await db.doc("organizations/ghmo/minutes/approved1").set({
    ...base,
    status: "approved",
    approvedAt: now,
    decisions: ["Buy the hall"],
    agenda: ["The hall"],
    actionItems: [{ task: "Call the bank" }],
    attendance: { present: ["Ann Private", "Bo Secret"], absent: ["Cy Hidden"] },
    approvalNotes: "internal only"
  });
  await db.doc("organizations/ghmo/minutes/draft1").set({ ...base, eventTitle: "Secret draft meeting", status: "draft", decisions: ["Sell everything"], agenda: [], actionItems: [] });
  const start = Timestamp.fromMillis(Date.UTC(2026, 5, 6, 18, 30));
  await db.doc("organizations/ghmo/events/ev1").set({ title: "Bhajan, evening", summary: "Songs", status: "published", startsAt: start, location: "Community hall" });
  await db.doc("organizations/ghmo/events/ev2").set({ title: "Unpublished plan", status: "draft", startsAt: start });
});

test("the public archive shows approved minutes only, with attendance as counts", async ({ page }) => {
  await page.goto("/minutes");
  await expect(page.getByRole("link", { name: /Spring board meeting/ })).toBeVisible();
  await expect(page.getByText("Secret draft meeting")).toHaveCount(0);

  await page.getByRole("link", { name: /Spring board meeting/ }).click();
  await expect(page.getByText("Buy the hall")).toBeVisible();
  await expect(page.getByText("Attendance: 2 present, 1 absent.")).toBeVisible();
  const html = await page.content();
  for (const hidden of ["Ann Private", "Bo Secret", "Cy Hidden", "internal only", "Alice", "Sell everything"]) expect(html).not.toContain(hidden);

  // A draft's id is not a way in (the response streams, so check what is shown rather than the status).
  for (const path of ["/minutes/draft1", "/minutes/does-not-exist"]) {
    await page.goto(path);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
    expect(await page.content()).not.toContain("Sell everything");
  }
});

test("calendar feed lists published events only, as a valid .ics", async ({ request }) => {
  const feed = await request.get("/api/calendar");
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const body = await feed.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:Bhajan\\, evening");
  expect(body).toContain("DTSTART:20260606T183000Z");
  expect(body).not.toContain("Unpublished plan");

  const single = await request.get("/api/calendar/ev1");
  expect(single.status()).toBe(200);
  expect((await single.text()).match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect((await request.get("/api/calendar/ev2")).status()).toBe(404);
});
