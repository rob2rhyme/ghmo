import { expect, test } from "@playwright/test";
import { admin, clearEmulators, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/**
 * The key-rotation drill from docs/RUNBOOK_INCIDENT.md, automated: a lost device is revoked, keys
 * rotate, new data is written under the new epoch, and the revoked device is locked out of it.
 */
test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("revoking a device and rotating keys locks it out of new data", async ({ browser }) => {
  test.setTimeout(240_000);
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  const chat = (page: typeof alice, text: string) => page.locator("p", { hasText: text });
  const nav = (page: typeof alice, name: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name }).click();
  const send = async (page: typeof alice, text: string) => {
    await page.getByPlaceholder("Share an update or ask for help...").fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat(page, text)).toBeVisible();
  };

  await signInWithNewPasskey(alice, "alice", "/admin/encryption");
  await turnOnEncryption(alice, "Alice laptop");
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(alice, bob, "Bob", "Bob phone");

  // --- Before the incident, both read the same chat ---
  await alice.goto("/admin/chat");
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await send(alice, "Before rotation");
  await bob.goto("/admin/chat");
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(chat(bob, "Before rotation")).toBeVisible();

  // --- Bob's phone is "lost": Alice revokes it and rotates ---
  await nav(alice, "Encryption");
  await alice.getByLabel("Select Bob phone to revoke").check();
  await alice.getByRole("button", { name: "Revoke selected and rotate keys" }).click();
  await alice.getByRole("dialog", { name: "Revoke 1 device(s) and create new keys?" }).getByRole("button", { name: "Revoke and rotate keys" }).click();
  await expect(alice.getByText("Devices revoked and keys rotated")).toBeVisible({ timeout: 20_000 });

  const { db } = admin();
  const state = (await db.doc("organizations/ghmo/e2ee/state").get()).data()!;
  expect(state.currentEpoch).toBe(2);
  const devices = (await db.collection("organizations/ghmo/e2ee/state/devices").get()).docs.map(d => d.data());
  expect(devices.find(d => d.uid === "bob")).toMatchObject({ status: "revoked" });
  // The new epoch's key is wrapped only for Alice's device and the recovery key, never for Bob's.
  const wraps2 = (await db.collection("organizations/ghmo/e2ee/state/wraps").get()).docs.filter(d => d.id.startsWith("2_")).map(d => d.data().recipient);
  expect(wraps2).toHaveLength(2);
  const bobDevice = (await db.collection("organizations/ghmo/e2ee/state/devices").where("uid", "==", "bob").get()).docs[0].id;
  expect(wraps2).not.toContain(bobDevice);

  // --- New data is written under the new epoch ---
  await nav(alice, "Admin Chat");
  await send(alice, "After rotation");
  // (The bubble shows from the local cache first, so wait for the write to reach the database.)
  await expect
    .poll(async () => (await db.collection("organizations/ghmo/adminChatMessages").get()).docs.filter(d => d.data().enc?.epoch === 2).length)
    .toBe(1);

  // --- The revoked device is locked out ---
  await bob.goto("/admin/chat");
  await expect(bob.getByText(/This device was revoked/)).toBeVisible();
  await expect(chat(bob, "After rotation")).toHaveCount(0);
  await expect(chat(bob, "Before rotation")).toHaveCount(0);

  await aliceContext.close();
  await bobContext.close();
});
