import { expect, test } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/**
 * Changing a member's email (plan §25, 18-A): super admins only; history stays with the member id; one address per
 * member; consent and opt-out stay with the person; an opted-out old address goes on the do-not-email list; the sign-in
 * link is reset; the activity entry holds neither address.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const ASHA = "mem0101";
const BINA = "mem0102";
const DEEP = "mem0103";
const url = (id: string) => `/api/organizations/ghmo/members/${id}/email`;
const member = async (id: string) => (await db.doc(`${ORG}/members/${id}`).get()).data() as Record<string, unknown>;

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const base = { status: "active", roles: ["member"] };
  await db.doc(`${ORG}/members/${ASHA}`).set({ ...base, name: "Asha Rai", email: "asha@example.org", emailLower: "asha@example.org", uid: "old-account", emailBounced: true, emailConsent: { source: "admin_on_request", at: new Date() }, groupIds: ["g1"] });
  await db.doc(`${ORG}/members/${BINA}`).set({ ...base, name: "Bina Thapa", email: "bina@example.org", emailLower: "bina@example.org", emailOptOutAt: new Date("2026-03-04T05:06:07Z"), hasPhone: true });
  await db.doc(`${ORG}/members/${DEEP}`).set({ ...base, name: "Deepak Gurung", emailLower: "", hasPhone: true });
  await db.doc(`${ORG}/members/${ASHA}/notes/n1`).set({ enc: { v: 1 }, authorUid: "alice", authorName: "Alice", createdAt: new Date() });
  await db.doc(`${ORG}/positionTerms/pt1`).set({ positionId: "treasurer", memberId: ASHA, startsOn: "2024-01-01", endsOn: null, note: "" });
});

test("a plain admin can't change an email", async ({ page }) => {
  await signInWithNewPasskey(page, "bob", "/admin/members");
  const res = await page.request.put(url(ASHA), { data: { email: "new@example.org" } });
  expect(res.status()).toBe(403);
  expect((await member(ASHA)).emailLower).toBe("asha@example.org");
});

test("a super admin changes, adds and removes addresses; every guard holds", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin/members");
  const api = page.request;

  // --- Change: history stays, consent stays, the old bounce and the sign-in link are cleared ---
  let res = await api.put(url(ASHA), { data: { email: "Asha.Rai@Example.org" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, kind: "changed", oldKept: true });
  const asha = await member(ASHA);
  expect(asha).toMatchObject({ email: "Asha.Rai@Example.org", emailLower: "asha.rai@example.org", uid: null, emailBounced: false, groupIds: ["g1"] });
  expect(asha.emailConsent).toBeTruthy();
  expect((await db.collection(`${ORG}/members/${ASHA}/notes`).get()).size).toBe(1);
  expect((await db.doc(`${ORG}/positionTerms/pt1`).get()).get("memberId")).toBe(ASHA);

  // --- Bad input and duplicates are refused in plain words ---
  expect((await api.put(url(ASHA), { data: { email: "not-an-address" } })).status()).toBe(400);
  expect((await api.put(url(ASHA), { data: { email: "Asha.Rai@Example.org" } })).status()).toBe(400);
  res = await api.put(url(ASHA), { data: { email: "BINA@example.org" } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toContain("Bina Thapa already uses this address");
  expect((await api.put(url("nobody1"), { data: { email: "x@example.org" } })).status()).toBe(404);
  // Adding a member at a used address is refused too.
  res = await api.post("/api/organizations/ghmo/members", { data: { email: "asha.rai@example.org", name: "Someone Else" } });
  expect(res.status()).toBe(409);

  // --- Bina opted out: she stays opted out, and her old address goes on the do-not-email list ---
  res = await api.put(url(BINA), { data: { email: "bina.new@example.org" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).oldKept).toBe(true);
  const bina = await member(BINA);
  expect((bina.emailOptOutAt as { toDate: () => Date }).toDate().toISOString()).toBe("2026-03-04T05:06:07.000Z");
  expect((await db.collection(`${ORG}/emailSuppressions`).get()).size).toBe(2); // Asha's bounced address and Bina's
  // Giving that old address to Deepak starts him opted out, with Bina's opt-out time.
  res = await api.put(url(DEEP), { data: { email: "bina@example.org" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).kind).toBe("added");
  const deep = await member(DEEP);
  expect(deep.emailLower).toBe("bina@example.org");
  expect((deep.emailOptOutAt as { toDate: () => Date }).toDate().toISOString()).toBe("2026-03-04T05:06:07.000Z");

  // --- Removing: only when a name and a phone number remain ---
  res = await api.put(url(ASHA), { data: { email: "" } });
  expect(res.status()).toBe(400);
  res = await api.put(url(BINA), { data: { email: "" } });
  expect(res.status()).toBe(200);
  expect(await member(BINA)).toMatchObject({ email: null, emailLower: "" });

  // --- Activity: one entry per change, with neither address ---
  const entries = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_email_changed").get()).docs.map(d => plainJson(d.data()));
  expect(entries).toHaveLength(4);
  for (const entry of entries) {
    // The actor (Alice) is named, as in every entry; the members' names and addresses never are.
    expect(entry).not.toMatch(/asha|bina|deepak/i);
  }
});

test("on the profile: a super admin edits, adds and removes an email; a plain admin only sees it", async ({ browser }) => {
  test.setTimeout(120_000);
  const alice = await browser.newPage();
  await signInWithNewPasskey(alice, "alice", `/admin/members/${ASHA}`);
  await waitForStreamedContent(alice);
  await expect(alice.getByTestId("member-email")).toHaveText("asha@example.org");

  // Change, typing the address twice; a mismatch keeps Save greyed out.
  await alice.getByRole("button", { name: "Edit email" }).click();
  let dialog = alice.getByRole("dialog");
  await expect(dialog.getByText("The old address bounced; the new one starts fresh.")).toBeVisible();
  await dialog.getByLabel("New email").fill("asha.rai@example.org");
  await dialog.getByLabel("Type it again").fill("asha.ria@example.org");
  await expect(dialog.getByText("The two addresses don't match.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save email" })).toBeDisabled();
  await dialog.getByLabel("Type it again").fill("asha.rai@example.org");
  await dialog.getByRole("button", { name: "Save email" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(alice.getByTestId("member-email")).toHaveText("asha.rai@example.org");
  expect((await member(ASHA)).emailLower).toBe("asha.rai@example.org");

  // A duplicate is refused in plain words, and nothing changes.
  await alice.getByRole("button", { name: "Edit email" }).click();
  dialog = alice.getByRole("dialog");
  await dialog.getByLabel("New email").fill("bina@example.org");
  await dialog.getByLabel("Type it again").fill("bina@example.org");
  await dialog.getByRole("button", { name: "Save email" }).click();
  await expect(alice.getByText(/Bina Thapa already uses this address/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // Asha has no phone number, so her email can't be removed.
  await alice.getByRole("button", { name: "Edit email" }).click();
  await expect(alice.getByRole("dialog").getByRole("button", { name: "Remove email…" })).toHaveCount(0);
  await alice.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Bina opted out and has a phone: the dialog says she stays opted out, and her email can be removed.
  await alice.goto(`/admin/members/${BINA}`);
  await waitForStreamedContent(alice);
  await alice.getByRole("button", { name: "Edit email" }).click();
  dialog = alice.getByRole("dialog");
  await expect(dialog.getByText("They opted out of email, and stay opted out at the new address.")).toBeVisible();
  await dialog.getByRole("button", { name: "Remove email…" }).click();
  await expect(alice.getByRole("dialog")).toHaveCount(1);
  await alice.getByRole("dialog").getByRole("button", { name: "Remove email", exact: true }).click();
  await expect(alice.getByTestId("member-email")).toContainText("No email address");
  expect(await member(BINA)).toMatchObject({ emailLower: "", email: null });

  // Deepak has no email yet: Add email.
  await alice.goto(`/admin/members/${DEEP}`);
  await waitForStreamedContent(alice);
  await alice.getByRole("button", { name: "Add email" }).click();
  dialog = alice.getByRole("dialog");
  await dialog.getByLabel("New email").fill("deepak@example.org");
  await dialog.getByLabel("Type it again").fill("Deepak@example.org");
  await dialog.getByRole("button", { name: "Save email" }).click();
  await expect(alice.getByTestId("member-email")).toHaveText("deepak@example.org");
  await alice.close();

  const bob = await browser.newPage();
  await signInWithNewPasskey(bob, "bob", `/admin/members/${ASHA}`);
  await waitForStreamedContent(bob);
  await expect(bob.getByTestId("member-email")).toHaveText("asha.rai@example.org");
  await expect(bob.getByText("Only a super admin can change an email address.")).toBeVisible();
  await expect(bob.getByRole("button", { name: /Edit email|Add email/ })).toHaveCount(0);
  await bob.close();
});
