import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

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

test("editing an event loads it, missing events say so, and delete asks first", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");

  await page.goto("/admin/events/ev1/edit");
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
