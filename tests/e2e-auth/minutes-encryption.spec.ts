import { expect, test } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, collectCspViolations, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const SUMMARY = "Discussed buying the old hall from the diocese";
const DECISION = "Offer eighty thousand for the hall";
const NOTES = "Approved subject to a survey";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
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

test("minutes are ciphertext while draft, approved by a different admin with the submitted content, published on approval, and reopened with a reason", async ({ browser }) => {
  test.setTimeout(240_000);
  const aliceContext = await browser.newContext();
  const page = await aliceContext.newPage();
  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Meeting minutes" }).click();

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

  // --- Submit; the submitter can't approve their own minutes ---
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await expect(page.getByText("You submitted these minutes, so another admin must approve them.")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/someone else must approve them/)).toBeVisible();
  expect((await col.doc(draft.id).get()).data()?.status).toBe("submitted");

  // --- Bob (another admin) approves, with notes ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(page, bob, "Bob", "Bob phone");
  await bob.goto("/admin/minutes?mode=records");
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await bob.locator("a[href*=\"minutesId=\"]").click();
  await bob.getByPlaceholder("Optional context for approvers").fill(NOTES);
  await bob.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => (await col.doc(draft.id).get()).data()?.status).toBe("approved");

  const approved = (await col.doc(draft.id).get()).data()!;
  expect(approved).toMatchObject({ status: "approved", approvedByUid: "bob", submittedByUid: "alice", version: 1 });
  expect(approved.published).toMatchObject({ discussionSummary: SUMMARY, decisions: [DECISION] });
  expect(approved).toHaveProperty("approvalEnc");
  expect(approved.approvalNotes ?? null).toBeNull();
  expect(JSON.stringify(approved.enc)).not.toContain("eighty");
  expect(JSON.stringify(approved.approvalEnc)).not.toContain("survey");
  // The approval is bound to the submitted content and kept as an immutable version.
  const version = (await col.doc(draft.id).collection("versions").doc("1").get()).data()!;
  expect(version).toMatchObject({ version: 1, approvedByUid: "bob", submittedByUid: "alice", contentHash: approved.contentHash });
  expect(approved.contentHash).toBe(approved.submittedHash);

  // The public archive serves the published copy and nothing private.
  const archived = await page.request.get(`/minutes/${draft.id}`);
  expect(archived.status()).toBe(200);
  const archivedHtml = await archived.text();
  expect(archivedHtml).toContain(SUMMARY);
  expect(archivedHtml).toContain(DECISION);
  for (const secret of ["survey", "approvalEnc"]) expect(archivedHtml).not.toContain(secret);

  // --- Reopening approved minutes needs a reason, unpublishes, and is audited ---
  await page.goto("/admin/minutes?mode=records");
  await page.getByRole("button", { name: "Unlock with passkey" }).click();
  await page.locator("a[href*=\"minutesId=\"]").click();
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect(page.getByText(/Say why you are reopening/)).toBeVisible();
  expect((await col.doc(draft.id).get()).data()?.status).toBe("approved");
  await page.getByPlaceholder(/Required\. Recorded in the audit log/).fill("Vote count needs a correction");
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect.poll(async () => (await col.doc(draft.id).get()).data()?.status).toBe("draft");
  const reopened = (await col.doc(draft.id).get()).data()!;
  expect(reopened).toMatchObject({ reopenedByUid: "alice", reopenReason: "Vote count needs a correction" });
  expect(reopened).not.toHaveProperty("published");
  expect(reopened).not.toHaveProperty("approvalEnc");
  const afterHtml = await (await page.request.get(`/minutes/${draft.id}`)).text();
  expect(afterHtml).not.toContain(SUMMARY);
  // The earlier approval is still on record.
  expect((await col.doc(draft.id).collection("versions").doc("1").get()).exists).toBe(true);
  const actions = (await db.collection("organizations/ghmo/auditLogs").get()).docs.map(d => d.data().action);
  expect(actions).toEqual(expect.arrayContaining(["minutes_submitted", "minutes_approved", "minutes_reopened"]));

  // --- The audit log never carries content ---
  const audit = JSON.stringify((await db.collection("organizations/ghmo/auditLogs").get()).docs.map(d => d.data()));
  for (const secret of ["eighty", "diocese", "survey"]) expect(audit).not.toContain(secret);

  expect(violations).toEqual([]);
  await aliceContext.close();
  await bobContext.close();
});
