import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, enrollAndApprove, plainJson, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent, memberAction, firstMemberAction } from "./helpers";

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
  await page.getByLabel("Name", { exact: true }).fill("Sam Lee");
  await page.locator("#member-phone").fill("(717) 555-0100");
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
  await memberAction(page, "Sam Lee", /^(Edit contact|Add phone)$/);
  await expect(page.getByRole("dialog").getByLabel("Phone", { exact: true })).toHaveValue("+17175550100");
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
  await expect(shown(page, "2 people found. 1 with a phone number.")).toBeVisible();
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
  await firstMemberAction(page, "They asked not to be called");
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
  await expect(page.locator("#member-phone")).toBeDisabled();

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

test("a member without an email is saved with a name and phone, keeps their number, gets no email consent, and isn't duplicated by an import", async ({ page }) => {
  test.setTimeout(180_000);
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  await waitForStreamedContent(page);

  // Without an email, a name is needed, and email consent can't be ticked.
  await expect(page.getByLabel("This person asked to receive email from us.")).toBeDisabled();
  // The Phone field says whether it is needed: required without an email, optional with one.
  await expect(page.getByLabel("Phone", { exact: true })).toBeVisible();
  const phoneHint = page.locator("#member-phone-description");
  await expect(phoneHint).toContainText("Needed when there is no email.");
  await page.getByLabel("Email", { exact: true }).fill("someone@example.org");
  await expect(phoneHint).toContainText("Optional when they have an email.");
  await page.getByLabel("Email", { exact: true }).fill("");
  await page.locator("#member-phone").fill("717-555-0102");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Add a name for someone without an email.")).toBeVisible();
  expect((await members().get()).size).toBe(0);

  await page.getByLabel("Name", { exact: true }).fill("Maya Gurung");
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "No email (phone only)")).toBeVisible();
  await expect(shown(page, "Can be called")).toBeVisible();
  const [mayaDoc] = (await members().where("name", "==", "Maya Gurung").get()).docs;
  const maya = mayaDoc.data();
  expect(maya).toMatchObject({ emailLower: "", hasPhone: true, status: "active" });
  expect(maya).not.toHaveProperty("email");
  expect(maya).not.toHaveProperty("emailConsent");
  expect(maya.phoneConsent).toMatchObject({ source: "admin_on_request", byUid: "alice" });
  expect(JSON.stringify(maya)).not.toContain("5550102");

  // The same name and number again is refused in the browser (only it can read the numbers).
  await page.getByLabel("Name", { exact: true }).fill("maya gurung");
  await page.locator("#member-phone").fill("(717) 555-0102");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("maya gurung with this number is already on the list.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("");
  await page.locator("#member-phone").fill("");

  // The server enforces the same rules: no member with neither email nor phone, no email consent
  // without an address, and a phone-only member keeps their number.
  const api = await page.evaluate(async (id: string) => {
    const send = async (url: string, method: string, body: unknown) =>
      (await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status;
    return {
      neither: await send("/api/organizations/ghmo/members", "POST", { name: "Nobody" }),
      consent: await send(`/api/organizations/ghmo/members/${id}`, "PATCH", { emailConsent: { source: "admin_on_request" } }),
      removeNumber: await send(`/api/organizations/ghmo/members/${id}`, "PATCH", { contact: null })
    };
  }, mayaDoc.id);
  expect(api).toEqual({ neither: 400, consent: 400, removeNumber: 400 });
  expect((await members().doc(mayaDoc.id).get()).data()).toMatchObject({ hasPhone: true });

  // Clearing the number in the dialog is refused too.
  await memberAction(page, "Maya Gurung", /^(Edit contact|Add phone)$/);
  await page.getByRole("dialog").getByLabel("Phone", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText(/Someone without an email needs a phone number/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Import a list with no email column: Maya is already there; Hari shares her phone and is added.
  await page.getByRole("button", { name: "Import a list" }).click();
  await page.getByLabel("Paste your list").fill("name,phone\nMaya Gurung,717-555-0102\nHari Gurung,717-555-0102\n");
  await expect(shown(page, "2 people found. 2 with a phone number. 2 without an email.")).toBeVisible();
  await expect(page.getByLabel(/agreed to receive email from us/)).toHaveCount(0);
  const importButton = page.getByRole("button", { name: /^Import 2 members$/ });
  await expect(importButton).toBeDisabled();
  await page.getByLabel(/These people gave their number for community calls/).check();
  await importButton.click();
  await expect(page.getByText("1 added (1 with a phone number), 1 already on the list")).toBeVisible();
  expect((await members().get()).size).toBe(2);
  const hari = (await members().where("name", "==", "Hari Gurung").get()).docs[0].data();
  expect(hari).toMatchObject({ emailLower: "", hasPhone: true, phoneConsent: { source: "imported", byUid: "alice" } });
  expect(hari).not.toHaveProperty("emailConsent");

  const imported = (await admin().db.collection(`${ORG}/auditLogs`).where("action", "==", "members_imported").get()).docs[0].data();
  expect(imported.after).toMatchObject({ created: 1, phoneOnly: 1, attested: false, phoneAttested: true });
  expect(plainJson(imported)).not.toContain("555");
});
