import { expect, test } from "@playwright/test";
import { admin, clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const GROOM = "Dil Bahadur Pun";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("signatures are sealed in the signer's browser, opened by an unlocked admin, and saved documents are ciphertext", async ({ browser }) => {
  test.setTimeout(240_000);
  const adminContext = await browser.newContext();
  const page = await adminContext.newPage();
  const violations = collectCspViolations(page);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Document Generator" }).click();

  // --- Fill a name, then reach the signature step and request a signature ---
  await page.getByRole("button", { name: "Wedding Certificate" }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("textbox").first().fill(GROOM);
  const request = page.getByRole("button", { name: "Request", exact: true }).first();
  for (let i = 0; i < 8 && !(await request.isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await request.click();

  const { db } = admin();
  const sessions = db.collection("signingSessions");
  await expect.poll(async () => (await sessions.get()).size).toBe(1);
  const sessionId = (await sessions.get()).docs[0].id;

  // --- The signer (no account) opens the link and signs ---
  const signerContext = await browser.newContext();
  const signer = await signerContext.newPage();
  const signerViolations = collectCspViolations(signer);
  await signer.goto(`/sign/${sessionId}`);
  await expect(signer.getByText(/Signature for/)).toBeVisible();
  const canvas = signer.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await signer.mouse.move(box.x + 20, box.y + 40);
  await signer.mouse.down();
  await signer.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
  await signer.mouse.move(box.x + 200, box.y + 50, { steps: 8 });
  await signer.mouse.up();
  await signer.getByRole("button", { name: "Submit signature" }).click();
  await expect(signer.getByText("Signature received. Thank you.")).toBeVisible();
  expect(signerViolations).toEqual([]);

  // --- At rest: sealed, never a PNG or server-encrypted blob ---
  const stored = (await sessions.doc(sessionId).get()).data()!;
  expect(stored.status).toBe("signed");
  expect(stored).toHaveProperty("signatureSealed");
  expect(stored).not.toHaveProperty("signatureEnc");
  expect(JSON.stringify(stored)).not.toContain("iVBOR");

  // --- The unlocked admin page opens it ---
  await expect(page.getByText("Signed ✓").first()).toBeVisible({ timeout: 20_000 });

  // Close the signing-link dialog that opened with the request.
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // --- Save the document: inputs are ciphertext ---
  for (let i = 0; i < 8 && !(await page.getByRole("button", { name: "Save to Gallery" }).isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save to Gallery" }).click();
  await expect(page.getByText(/Document saved \(ID/)).toBeVisible();
  const docs = await db.collection("organizations/ghmo/documents").get();
  expect(docs.size).toBe(1);
  expect(docs.docs[0].data()).toHaveProperty("enc");
  expect(docs.docs[0].data()).not.toHaveProperty("inputs");
  expect(JSON.stringify(docs.docs[0].data())).not.toContain("Pun");

  // --- Finalize: the browser builds and encrypts the PDF; the server stores only ciphertext ---
  await page.getByRole("button", { name: "Finalize & Save Signed Certificate" }).click();
  await expect(page.getByText(/Signed PDF saved/)).toBeVisible({ timeout: 30_000 });
  const all = await db.collection("organizations/ghmo/documents").get();
  const finalized = all.docs.find(d => d.data().status === "finalized")!;
  expect(finalized.data()).toHaveProperty("enc");
  expect(finalized.data()).not.toHaveProperty("pdfBase64");
  expect(finalized.data()).not.toHaveProperty("inputs");
  const after = (await sessions.doc(sessionId).get()).data()!;
  expect(after.status).toBe("finalized");
  expect(after).not.toHaveProperty("signatureSealed");

  expect(violations).toEqual([]);
});
