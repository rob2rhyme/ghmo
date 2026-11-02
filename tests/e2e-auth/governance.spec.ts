import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("action items from approved minutes are tracked privately, and attendance exports as CSV", async ({ page }) => {
  test.setTimeout(180_000);
  const { db } = admin();
  const day = 24 * 3600 * 1000;
  await db.doc("organizations/ghmo/minutes/m1").set({
    eventId: "e1",
    eventTitle: "Spring board meeting",
    eventDate: Timestamp.fromMillis(Date.now() - 30 * day),
    meetingType: "Board",
    recordedBy: "Alice",
    status: "approved",
    createdAt: Timestamp.now(),
    agenda: [],
    decisions: ["Buy the hall"],
    actionItems: [
      { task: "Call the bank", assignedTo: "Ann", dueDate: Timestamp.fromMillis(Date.now() - 5 * day) },
      { task: "Book the caterer", dueDate: Timestamp.fromMillis(Date.now() + 5 * day) }
    ],
    attendance: { present: ["Ann", "=HYPERLINK(\"http://evil.example\")"], absent: ["Bo"] }
  });

  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Action items" }).click();

  // --- Overdue item first; mark it done ---
  await expect(page.getByText("2 overdue").or(page.getByText("1 overdue"))).toBeVisible();
  const first = page.locator("li").filter({ hasText: "Call the bank" });
  await expect(first.getByText("Overdue")).toBeVisible();
  await first.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Call the bank")).toHaveCount(0); // moves out of the Open filter
  await page.getByRole("button", { name: "Done / not needed" }).click();
  await expect(page.getByText("Call the bank")).toBeVisible();

  // --- At rest the status is ciphertext ---
  const statuses = await db.collection("organizations/ghmo/actionItemStatus").get();
  expect(statuses.size).toBe(1);
  expect(statuses.docs[0].data()).toHaveProperty("enc");
  expect(statuses.docs[0].data()).not.toHaveProperty("status");
  expect(statuses.docs[0].data()).toMatchObject({ updatedBy: "alice" });

  // --- It survives a reload (after unlocking) ---
  await page.reload();
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await page.getByRole("button", { name: "Done / not needed" }).click();
  await expect(page.getByText("Call the bank")).toBeVisible();

  // --- Attendance export: one row per person, spreadsheet formulas defused ---
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Meeting minutes" }).click();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page.getByText("1 result")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download attendance (CSV)" }).click()]);
  const csv = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  const rows = csv.trim().split("\r\n");
  expect(rows[0]).toBe("Date,Event,Meeting type,Minutes status,Name,Attendance");
  expect(rows).toHaveLength(4);
  expect(csv).toContain("Ann,Present");
  expect(csv).toContain("Bo,Absent");
  expect(csv).toContain("'=HYPERLINK");

  expect(violations).toEqual([]);
});
