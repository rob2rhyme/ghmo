import { expect, test } from "@playwright/test";
import { admin, clearEmulators, collectCspViolations, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const TITLE = "Buy the old hall";
const BODY = "Offer eighty thousand, closing before March";
const COMMENT = "Treasurer confirms the funds are available";
const CONCLUSION = "Proceed with the purchase";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("threads, comments, conclusions and votes are ciphertext at rest and decrypt for approved admins", async ({ browser }) => {
  test.setTimeout(240_000);
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const violations = collectCspViolations(alice);
  await signInWithNewPasskey(alice, "alice", "/admin/encryption");
  await turnOnEncryption(alice, "Alice laptop");
  await alice.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Plans & Issues" }).click();

  // --- Start a topic, discuss, propose a conclusion, vote ---
  await alice.getByPlaceholder("e.g., Approve community outreach plan").fill(TITLE);
  await alice.getByPlaceholder("Summarize the plan, proposal, or issue.").fill(BODY);
  await alice.getByRole("button", { name: "Start topic" }).click();
  await alice.getByRole("link", { name: new RegExp(TITLE) }).click();
  await expect(alice.getByRole("heading", { name: TITLE })).toBeVisible();

  await alice.getByPlaceholder("Share feedback or a decision.").fill(COMMENT);
  await alice.getByRole("button", { name: "Post comment" }).click();
  await expect(alice.getByText(COMMENT)).toBeVisible();

  await alice.getByRole("button", { name: "Propose Conclusion" }).click();
  await alice.getByPlaceholder("Summarize the decision or outcome.").fill(CONCLUSION);
  await alice.getByRole("button", { name: "Propose conclusion", exact: true }).last().click();
  await expect(alice.getByText(CONCLUSION)).toBeVisible();
  await alice.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(alice.getByText("1 approve")).toBeVisible();

  // --- At rest: only ciphertext, and no text in the audit log ---
  const { db } = admin();
  const threads = await db.collection("organizations/ghmo/commsThreads").get();
  expect(threads.size).toBe(1);
  const threadDoc = threads.docs[0];
  expect(threadDoc.data()).toHaveProperty("enc");
  expect(threadDoc.data()).not.toHaveProperty("title");
  expect(threadDoc.data().conclusion).toHaveProperty("enc");
  expect(threadDoc.data().conclusion).not.toHaveProperty("text");
  const comments = await threadDoc.ref.collection("comments").get();
  const votes = await threadDoc.ref.collection("conclusionVotes").get();
  const everything = JSON.stringify([threadDoc.data(), ...comments.docs.map(d => d.data()), ...votes.docs.map(d => d.data())]);
  for (const secret of ["old hall", "eighty", "Treasurer", "Proceed", "approve"]) expect(everything).not.toContain(secret);
  const audit = JSON.stringify((await db.collection("organizations/ghmo/auditLogs").get()).docs.map(d => d.data()));
  for (const secret of ["old hall", "eighty", "Treasurer", "Proceed"]) expect(audit).not.toContain(secret);

  // --- Bob is approved, then reads everything and rejects; the tally updates for both ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(alice, bob, "Bob", "Bob phone");
  await bob.goto(`/admin/comms/${threadDoc.id}`);
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bob.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(bob.getByText(COMMENT)).toBeVisible();
  await expect(bob.getByText(CONCLUSION)).toBeVisible();
  await expect(bob.getByText("1 approve")).toBeVisible();
  await bob.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(bob.getByText("1 reject")).toBeVisible();

  // Bob's vote reached Alice's device, decrypted.
  await alice.goto(`/admin/comms/${threadDoc.id}`);
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(alice.getByText("1 reject")).toBeVisible({ timeout: 15_000 });

  // Finalizing works with an encrypted conclusion.
  await alice.getByRole("button", { name: "Finalize Close" }).click();
  await expect(alice.getByText(/Finalized/)).toBeVisible();
  expect((await threadDoc.ref.get()).data()?.status).toBe("closed");

  expect(violations).toEqual([]);
  await aliceContext.close();
  await bobContext.close();
});
