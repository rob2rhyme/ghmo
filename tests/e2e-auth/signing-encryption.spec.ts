import { readFile, writeFile } from "node:fs/promises";
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
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Document generator" }).click();

  // --- Fill a name, then reach the signature step and request a signature ---
  await page.getByRole("button", { name: "Wedding Certificate" }).first().click();
  await page.getByPlaceholder("GHMO-2024-001").fill("GHMO-2026-001");
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
  await expect(page.getByText("Signed").first()).toBeVisible({ timeout: 20_000 });

  // Close the signing-link dialog that opened with the request.
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // --- Save the document: inputs are ciphertext ---
  for (let i = 0; i < 8 && !(await page.getByRole("button", { name: "Save to Gallery" }).isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save to Gallery" }).click();
  await expect(page.getByText("Saved to the document gallery")).toBeVisible();
  const docs = await db.collection("organizations/ghmo/documents").get();
  expect(docs.size).toBe(1);
  expect(docs.docs[0].data()).toHaveProperty("enc");
  expect(docs.docs[0].data()).not.toHaveProperty("inputs");
  expect(JSON.stringify(docs.docs[0].data())).not.toContain("Pun");

  // --- Finalize: the browser builds and encrypts the PDF; the server stores only ciphertext ---
  // The preview carries the verification QR code that will be printed on the certificate.
  expect(await page.content()).toContain("Verification QR code");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Finalize & Save Signed Certificate" }).click()
  ]);
  await expect(page.getByText(/Signed PDF saved/)).toBeVisible({ timeout: 30_000 });
  const pdf = await readFile((await download.path())!);
  const all = await db.collection("organizations/ghmo/documents").get();
  const finalized = all.docs.find(d => d.data().status === "finalized")!;
  expect(finalized.data()).toHaveProperty("enc");
  expect(finalized.data()).not.toHaveProperty("pdfBase64");
  expect(finalized.data()).not.toHaveProperty("inputs");
  const after = (await sessions.doc(sessionId).get()).data()!;
  expect(after.status).toBe("finalized");
  expect(after).not.toHaveProperty("signatureSealed");

  // --- Anyone can verify the certificate from its QR code, without learning who it is for ---
  const certificates = await db.collection("certificates").get();
  expect(certificates.size).toBe(1);
  const record = certificates.docs[0].data();
  expect(record).toMatchObject({ certificateId: "GHMO-2026-001", templateId: "wedding-certificate", status: "valid", issuedByUid: "alice" });
  expect(JSON.stringify(record)).not.toContain("Pun");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/verify/${record.code}`);
  await expect(visitor.getByText("Genuine certificate")).toBeVisible();
  await expect(visitor.getByText("GHMO-2026-001")).toBeVisible();
  await expect(visitor.getByText("Pun")).toHaveCount(0);

  // The exact PDF that was issued checks out; any other file does not.
  const pick = (name: string, bytes: Buffer) => writeFile(`test-results/${name}`, bytes).then(() => `test-results/${name}`);
  await visitor.setInputFiles("#verify-pdf", await pick("issued.pdf", pdf));
  await expect(visitor.getByText("This file is exactly the certificate that was issued.")).toBeVisible();
  await visitor.setInputFiles("#verify-pdf", await pick("altered.pdf", Buffer.concat([pdf, Buffer.from("x")])));
  await expect(visitor.getByText(/does not match the issued certificate/)).toBeVisible();

  // Unknown codes and records whose database entry was altered both read as invalid.
  await visitor.goto("/verify/AAAAAAAAAAAAAAAA");
  await expect(visitor.getByText("No matching certificate")).toBeVisible();
  await certificates.docs[0].ref.update({ certificateId: "GHMO-2026-999" });
  await visitor.goto(`/verify/${record.code}`);
  await expect(visitor.getByText("No matching certificate")).toBeVisible();

  expect(violations).toEqual([]);
});
