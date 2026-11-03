import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent } from "./helpers";

/**
 * Phase 9-A (plan §12): a member's phone number is encrypted in the admin's browser, stored as an
 * envelope the server cannot read, shown masked until tapped, and readable on another approved device.
 */

const ORG = "organizations/ghmo";
const members = () => admin().db.collection(`${ORG}/members`);
const byEmail = async (email: string) => (await members().where("emailLower", "==", email).get()).docs[0]?.data();
const shown = (page: Page, text: string) => page.locator("#admin-main").getByText(text, { exact: true }).filter({ visible: true });
const SAM_DIGITS = "5550100";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("numbers are ciphertext in Firestore and the audit log, masked on screen, importable, and readable on another approved device", async ({ browser }) => {
  test.setTimeout(240_000);
  const aliceContext = await browser.newContext();
  const page = await aliceContext.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  await expect(shown(page, "No members yet")).toBeVisible();

  // --- Add a member with a number and call consent ---
  await page.getByLabel("Email", { exact: true }).fill("sam@example.org");
  await page.getByLabel("Name (optional)").fill("Sam Lee");
  await page.getByLabel("Phone (optional)").fill("(717) 555-0100");
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "Can be called")).toBeVisible();
  await expect(shown(page, "•••-•••-0100")).toBeVisible();
  await expect(shown(page, "(717) 555-0100")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Sam Lee's number" }).click();
  await expect(shown(page, "(717) 555-0100")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call Sam Lee" })).toHaveAttribute("href", "tel:+17175550100");

  const sam = (await byEmail("sam@example.org"))!;
  expect(sam.hasPhone).toBe(true);
  expect(sam.phoneConsent).toMatchObject({ source: "admin_on_request", byUid: "alice" });
  expect(Object.keys(sam.contact as object).sort()).toEqual(["ct", "dev", "epoch", "iv", "sig", "v"]);
  expect(JSON.stringify(sam)).not.toContain(SAM_DIGITS);
  expect(sam).not.toHaveProperty("phone");

  const created = await admin().db.collection(`${ORG}/auditLogs`).where("action", "==", "member_created").get();
  expect(created.size).toBe(1);
  const createdJson = JSON.stringify(created.docs[0].data());
  expect(createdJson).not.toContain(SAM_DIGITS);
  expect(createdJson).toContain("[encrypted]");

  // --- Edit the contact: a language is added, the number stays ---
  await page.getByRole("button", { name: "Edit contact for Sam Lee" }).click();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+17175550100");
  await page.getByLabel("Preferred language (optional)").fill("Nepali");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact saved")).toBeVisible();
  await expect(shown(page, "Nepali")).toBeVisible();
  const edited = (await byEmail("sam@example.org"))!;
  expect(JSON.stringify(edited)).not.toContain("Nepali");
  expect((edited.contact as { sig: string }).sig).not.toBe((sam.contact as { sig: string }).sig);

  // --- Import with a phone column: encrypted in the browser, consent recorded as imported ---
  await page.getByRole("button", { name: "Import a list" }).click();
  await page.getByLabel("Paste your list").fill("email,name,phone\npat@example.org,Pat,717-555-0101\nkim@example.org,Kim,\n");
  await expect(shown(page, "2 valid addresses found. 1 with a phone number.")).toBeVisible();
  const importButton = page.getByRole("button", { name: /^Import 2 members$/ });
  await page.getByLabel(/These people agreed to receive email/).check();
  await expect(importButton).toBeDisabled();
  await page.getByLabel(/These people gave their number for community calls/).check();
  await importButton.click();
  await expect(page.getByText("2 added (1 with a phone number)")).toBeVisible();
  const pat = (await byEmail("pat@example.org"))!;
  expect(pat.hasPhone).toBe(true);
  expect(pat.phoneConsent).toMatchObject({ source: "imported", byUid: "alice" });
  expect(JSON.stringify(pat)).not.toContain("5550101");
  const kim = (await byEmail("kim@example.org"))!;
  expect(kim.hasPhone).toBe(false);
  expect(kim).not.toHaveProperty("contact");
  await expect(shown(page, "•••-•••-0101")).toBeVisible();

  // --- A call opt-out is recorded and shown ---
  await page.getByRole("button", { name: "They asked not to be called" }).first().click();
  await expect(shown(page, "Asked not to be called")).toBeVisible();
  const optedOut = (await members().where("callOptOutAt", "!=", null).get()).docs;
  expect(optedOut).toHaveLength(1);

  // --- Bob, on an approved device, can read Sam's number; the server never could ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(page, bob, "Bob", "Bob phone");
  await bob.goto("/admin/members");
  await waitForStreamedContent(bob);
  await expect(bob.getByText("Phone number on file (unlock to view)").first()).toBeVisible();
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(shown(bob, "•••-•••-0100")).toBeVisible();
  await bob.getByRole("button", { name: "Show Sam Lee's number" }).click();
  await expect(shown(bob, "(717) 555-0100")).toBeVisible();
  await expect(shown(bob, "Nepali")).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
});

test("without encryption on, numbers cannot be added and a plaintext phone is never stored", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/members");
  await expect(page.getByText("Encryption is off, so phone numbers can't be added yet")).toBeVisible();
  await expect(page.getByLabel("Phone (optional)")).toBeDisabled();

  const results = await page.evaluate(async () => {
    const post = async (body: unknown) => {
      const res = await fetch("/api/organizations/ghmo/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return res.status;
    };
    const envelope = { v: 1, epoch: 1, dev: "d".repeat(24), iv: "a".repeat(16), ct: "b".repeat(40), sig: "c".repeat(80) };
    return {
      // An envelope while encryption is off is refused.
      withEnvelope: await post({ email: "enc@example.org", id: "ENCENCENCENCENCENCEN", contact: { enc: envelope, hasPhone: true } }),
      // A stray plaintext phone field is dropped, not stored.
      withPlaintext: await post({ email: "plain@example.org", phone: "717-555-0100" })
    };
  });
  expect(results.withEnvelope).toBe(400);
  expect(results.withPlaintext).toBe(201);
  expect(await byEmail("enc@example.org")).toBeUndefined();
  const plain = (await byEmail("plain@example.org"))!;
  expect(plain.hasPhone).toBe(false);
  expect(JSON.stringify(plain)).not.toContain("5550100");
});
