import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const SUMMARY = "Discussed buying the old hall from the diocese";
const DECISION = "Offer eighty thousand for the hall";
const NOTES = "Approved subject to a survey";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  // The admin events list reads organizations/ghmo-site/events while the public minutes route reads
  // organizations/ghmo/events, so the event is seeded in both.
  const event = {
    title: "Spring board meeting",
    body: "Quarterly meeting",
    status: "published",
    startsAt: Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000)
  };
  await admin().db.doc("organizations/ghmo-site/events/ev1").set(event);
  await admin().db.doc("organizations/ghmo/events/ev1").set(event);
});

test("minutes are ciphertext while draft, published in plaintext only on approval, and unpublished on return to draft", async ({ page }) => {
  test.setTimeout(180_000);
  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Meeting Minutes" }).click();

  // --- Write and save a draft ---
  await page.locator("select").first().selectOption("ev1");
  await page.getByPlaceholder("Summarize the discussion").fill(SUMMARY);
  await page.getByPlaceholder("Decision").first().fill(DECISION);
  await page.getByRole("button", { name: "Save Minutes" }).click();
  await expect(page.getByText("Meeting minutes saved")).toBeVisible();

  const { db } = admin();
  const col = db.collection("organizations/ghmo/minutes");
  const [draft] = (await col.get()).docs;
  expect(draft.data()).toMatchObject({ status: "draft", eventTitle: "Spring board meeting" });
  expect(draft.data()).toHaveProperty("enc");
  expect(draft.data()).not.toHaveProperty("discussionSummary");
  expect(draft.data()).not.toHaveProperty("decisions");
  expect(JSON.stringify(draft.data())).not.toContain("eighty");

  // --- Records search works on decrypted text; open the record from there ---
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await expect(page.getByText(DECISION)).toBeVisible();
  await page.getByPlaceholder(/Event title, agenda/).fill("eighty");
  await expect(page.getByText("1 result")).toBeVisible();
  await page.locator("a[href*=\"minutesId=\"]").click();
  await expect(page.getByPlaceholder("Summarize the discussion")).toHaveValue(SUMMARY);

  // --- Submit, approve with notes ---
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await page.getByPlaceholder("Optional context for approvers").fill(NOTES);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => (await col.doc(draft.id).get()).data()?.status).toBe("approved");

  const approved = (await col.doc(draft.id).get()).data()!;
  expect(approved.status).toBe("approved");
  expect(approved.published).toMatchObject({ discussionSummary: SUMMARY, decisions: [DECISION] });
  expect(approved).toHaveProperty("approvalEnc");
  expect(approved.approvalNotes ?? null).toBeNull();
  expect(JSON.stringify(approved.enc)).not.toContain("eighty");
  expect(JSON.stringify(approved.approvalEnc)).not.toContain("survey");

  // The public endpoint serves the published copy and nothing private.
  const res = await page.request.get("/api/organizations/ghmo/events/ev1/minutes");
  const body = await res.json();
  expect(body.minutes).toMatchObject({ status: "approved", discussionSummary: SUMMARY, decisions: [DECISION] });
  expect(JSON.stringify(body)).not.toContain("approvalEnc");
  expect(JSON.stringify(body)).not.toContain("survey");
  expect(body.minutes).not.toHaveProperty("enc");

  // --- Returning to draft unpublishes ---
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect.poll(async () => (await col.doc(draft.id).get()).data()?.status).toBe("draft");
  const reopened = (await col.doc(draft.id).get()).data()!;
  expect(reopened.status).toBe("draft");
  expect(reopened).not.toHaveProperty("published");
  expect(reopened).not.toHaveProperty("approvalEnc");
  const after = await (await page.request.get("/api/organizations/ghmo/events/ev1/minutes")).json();
  expect(after.minutes).toBeNull();

  // --- The audit log never carries content ---
  const audit = JSON.stringify((await db.collection("organizations/ghmo/auditLogs").get()).docs.map(d => d.data()));
  for (const secret of ["eighty", "diocese", "survey"]) expect(audit).not.toContain(secret);

  expect(violations).toEqual([]);
});
