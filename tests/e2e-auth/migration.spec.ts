import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

const by = { uid: "alice", name: "Alice" };

test("existing plaintext records are encrypted, verified and readable afterwards", async ({ page }) => {
  test.setTimeout(240_000);
  const { db } = admin();
  const now = Timestamp.now();
  const threads = db.collection("organizations/ghmo/commsThreads");

  // --- Records written before encryption existed ---
  await db.doc("organizations/ghmo/adminChatMessages/c1").set({ body: "legacy chat secret", createdAt: now, createdBy: by });
  await threads.doc("t1").set({
    title: "Legacy thread title",
    body: "legacy thread body",
    status: "closing",
    createdBy: by,
    createdAt: now,
    lastActivityAt: now,
    conclusion: { text: "legacy conclusion", proposedBy: by, proposedAt: now }
  });
  await threads.doc("t1").collection("comments").doc("cm1").set({ body: "legacy comment", createdAt: now, createdBy: by });
  await threads.doc("t1").collection("conclusionVotes").doc("alice").set({ value: "approve", createdAt: now, createdBy: by });
  const minute = { eventId: "e", eventTitle: "Board", meetingType: "Board", recordedBy: "Alice", agenda: [], actionItems: [], createdAt: now };
  await db.doc("organizations/ghmo/minutes/m1").set({ ...minute, status: "draft", decisions: ["legacy decision"], discussionSummary: "legacy summary" });
  await db.doc("organizations/ghmo/minutes/m2").set({ ...minute, status: "approved", decisions: ["public decision"] });
  await db.doc("organizations/ghmo/documents/d1").set({ templateId: "x", templateTitle: "X", category: "G", inputs: { groomName: "Legacy Groom" }, createdAt: now });

  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  // --- Run the migration ---
  await page.getByRole("button", { name: "Encrypt existing records" }).click();
  await expect(page.getByText("All records are encrypted")).toBeVisible({ timeout: 60_000 });
  for (const area of ["chat", "threads", "conclusions", "comments", "votes", "minutes", "documents"]) {
    await expect(page.getByTestId(`migrate-${area}`)).not.toHaveText("Not started");
  }

  // --- Nothing readable is left (except what is public by design) ---
  const raw = async (path: string) => (await db.doc(path).get()).data()!;
  const stored = JSON.stringify([
    await raw("organizations/ghmo/adminChatMessages/c1"),
    await raw("organizations/ghmo/commsThreads/t1"),
    await raw("organizations/ghmo/commsThreads/t1/comments/cm1"),
    await raw("organizations/ghmo/commsThreads/t1/conclusionVotes/alice"),
    await raw("organizations/ghmo/minutes/m1"),
    await raw("organizations/ghmo/documents/d1")
  ]);
  for (const secret of ["legacy", "Legacy", "approve"]) expect(stored).not.toContain(secret);
  expect(await raw("organizations/ghmo/minutes/m2")).toMatchObject({ decisions: ["public decision"] });
  expect(await raw("organizations/ghmo/commsThreads/t1")).toMatchObject({ status: "closing", conclusion: { enc: expect.anything() } });

  // --- Still readable on this device ---
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Plans & Issues" }).click();
  await expect(page.getByText("Legacy thread title")).toBeVisible();
  await page.getByRole("link", { name: /Legacy thread title/ }).click();
  await expect(page.getByText("legacy comment")).toBeVisible();
  await expect(page.getByText("legacy conclusion")).toBeVisible();
  await expect(page.getByText("1 approve")).toBeVisible();

  // --- A second run has nothing left to do ---
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Encryption" }).click();
  await page.getByRole("button", { name: "Encrypt existing records" }).click();
  await expect(page.getByTestId("migrate-chat")).toHaveText("Nothing to do");

  expect(violations).toEqual([]);
});
