import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

const DAY = 24 * 3600 * 1000;

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice Rai", ["super_admin"]);
  const { db } = admin();
  await db.doc("organizations/ghmo/events/ev1").set({
    title: "Dashain celebration",
    summary: "Food, music and tika",
    body: "Everyone is welcome.",
    status: "published",
    startsAt: Timestamp.fromMillis(Date.now() + 10 * DAY),
    timezone: "America/New_York",
    location: "Community hall"
  });
});

test("public events show real dates and list upcoming events", async ({ page, request }) => {
  const res = await request.get("/api/organizations/ghmo/events");
  const { events } = (await res.json()) as { events: { id: string; startsAt: unknown }[] };
  // Dates leave the API as epoch milliseconds, not raw Firestore objects.
  expect(typeof events.find(e => e.id === "ev1")?.startsAt).toBe("number");

  await page.goto("/c/ghmo/events");
  await expect(page.getByText("Dashain celebration").first()).toBeVisible();
  await expect(page.getByText("Invalid Date")).toHaveCount(0);

  await page.goto("/c/ghmo/events/ev1");
  await expect(page.getByRole("heading", { name: "Dashain celebration" })).toBeVisible();
  await expect(page.getByText("Invalid Date")).toHaveCount(0);
});

test("a past event says so, offers no calendar button, and shows minutes only when there are some", async ({ page }) => {
  const { db } = admin();
  const when = Timestamp.fromMillis(Date.now() - 10 * DAY);
  const past = { status: "published", startsAt: when, timezone: "America/New_York" };
  await db.doc("organizations/ghmo/events/past1").set({ ...past, title: "Football day" });
  await db.doc("organizations/ghmo/events/past2").set({ ...past, title: "Autumn general meeting" });
  await db.doc("organizations/ghmo/minutes/min2").set({
    eventId: "past2",
    eventTitle: "Autumn general meeting",
    meetingType: "General",
    status: "approved",
    eventDate: when,
    approvedAt: Timestamp.now(),
    createdAt: when,
    agenda: [],
    decisions: ["Paint the hall"],
    actionItems: []
  });

  await page.goto("/c/ghmo/events/past1");
  await expect(page.getByText("This event has passed.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add to calendar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download flyer (PDF)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meeting minutes" })).toHaveCount(0);

  await page.goto("/c/ghmo/events/past2");
  await expect(page.getByRole("link", { name: "Read the minutes" })).toBeVisible();

  // Upcoming events still offer the calendar file and say nothing about having passed.
  await page.goto("/c/ghmo/events/ev1");
  await expect(page.getByRole("link", { name: "Add to calendar", exact: true })).toBeVisible();
  await expect(page.getByText("This event has passed.")).toHaveCount(0);

  // The list shows upcoming events first; past ones are marked.
  await page.goto("/c/ghmo/events");
  await expect(page.getByText("Dashain celebration").first()).toBeVisible();
  await expect(page.getByText("Football day")).toHaveCount(0);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "All" }).click();
  // "All" puts the two groups under their own subheadings; the cards are h3 inside them.
  const groups = await page.getByRole("main").getByRole("heading", { level: 2 }).allTextContents();
  expect(groups).toEqual(["Upcoming events", "Past events"]);
  const titles = await page.getByRole("main").getByRole("heading", { level: 3 }).allTextContents();
  expect(titles.indexOf("Dashain celebration")).toBeGreaterThanOrEqual(0);
  expect(titles.indexOf("Dashain celebration")).toBeLessThan(titles.indexOf("Football day"));
  await expect(page.locator("article").getByText("Past", { exact: true })).toHaveCount(2);

  // An admin's browser adds the minutes controls.
  await signInWithNewPasskey(page, "alice", "/admin");
  await page.goto("/c/ghmo/events/past1");
  await expect(page.getByRole("link", { name: "Add minutes" })).toBeVisible();
  await page.goto("/c/ghmo/events/past2");
  await expect(page.getByRole("link", { name: "Open meeting minutes" })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});

test("editing an event loads it, missing events say so, and delete asks first", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");

  await page.goto("/admin/events/ev1/edit");
  await waitForStreamedContent(page);
  await expect(page.getByLabel("Event name")).toHaveValue("Dashain celebration");
  await expect(page.getByLabel("Place")).toHaveValue("Community hall");

  // Delete opens a confirmation; cancelling keeps the event.
  await page.getByRole("button", { name: "Delete event" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this event?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await admin().db.doc("organizations/ghmo/events/ev1").get()).exists).toBe(true);

  await page.getByRole("button", { name: "Delete event" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete event" }).click();
  await page.waitForURL(/\/admin\/events$/);
  expect((await admin().db.doc("organizations/ghmo/events/ev1").get()).exists).toBe(false);

  // An unknown event is a clear message, not a blank form that could overwrite something.
  // Events saved by older versions live under organizations/ghmo-site/events; they open and save too.
  await admin().db.doc("organizations/ghmo-site/events/old1").set({
    title: "Older event",
    body: "Saved before 2026-11.",
    status: "draft",
    startsAt: Timestamp.fromMillis(Date.now() + 20 * DAY)
  });
  await page.goto("/admin/events");
  await waitForStreamedContent(page);
  await expect(page.getByText("Older event")).toBeVisible();
  await page.goto("/admin/events/old1/edit");
  await expect(page.getByLabel("Event name")).toHaveValue("Older event");
  await page.getByLabel("Place").fill("Library");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/\/admin\/events$/);
  expect((await admin().db.doc("organizations/ghmo-site/events/old1").get()).get("location")).toBe("Library");
  expect((await admin().db.doc("organizations/ghmo/events/old1").get()).exists).toBe(false);

  await page.goto("/admin/events/nope/edit");
  await expect(page.getByText("This event doesn't exist")).toBeVisible();
  await expect(page.getByLabel("Event name")).toHaveCount(0);
});

test("public pages never show placeholder media or a fake donate link", async ({ page }) => {
  for (const path of ["/", "/multimedia", "/donate"]) {
    await page.goto(path);
    const html = await page.content();
    expect(html).not.toMatch(/dQw4w9WgXcQ|images\.unsplash\.com|replace-with-ghmo|FACEBOOK_PAGE_URL|YOUTUBE_API_KEY|Configure GoFundMe/);
  }
  await page.goto("/gumba-project");
  await expect(page).toHaveURL(/\/donate$/);
});

test.describe("event times follow the event's time zone, not the admin's computer", () => {
  // An admin travelling in Japan still means 7:00 PM in Harrisburg.
  test.use({ timezoneId: "Asia/Tokyo" });

  test("7:00 PM Eastern is saved and shown as 7:00 PM Eastern", async ({ page }) => {
    await signInWithNewPasskey(page, "alice", "/admin");
    await page.goto("/admin/events/ev1/edit");
    await expect(page.getByLabel("Event name")).toHaveValue("Dashain celebration");
    await expect(page.getByLabel("Time zone")).toHaveValue("America/New_York");
    await page.getByLabel("Starts").fill("2026-12-12T19:00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/admin\/events$/);

    const saved = (await admin().db.doc("organizations/ghmo/events/ev1").get()).get("startsAt") as Timestamp;
    expect(saved.toDate().toISOString()).toBe("2026-12-13T00:00:00.000Z");

    // Reopening shows the same wall time, and the public page says 7:00 PM.
    await page.goto("/admin/events/ev1/edit");
    await expect(page.getByLabel("Starts")).toHaveValue("2026-12-12T19:00");
    await page.goto("/c/ghmo/events/ev1");
    await expect(page.getByText(/7:00\s?PM/).first()).toBeVisible();
  });
});

test("a missing record gets the site's styled 404, not the framework default", async ({ page }) => {
  // The page streams (loading.tsx), so the status is already sent when the record turns out to be
  // missing; Next.js then marks the page noindex. What visitors see is what matters here.
  await page.goto("/minutes/does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "Go to the home page" })).toBeVisible();
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
});
