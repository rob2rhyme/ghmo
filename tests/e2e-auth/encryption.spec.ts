import { expect, test } from "@playwright/test";
import { clearEmulators, collectCspViolations, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("super admin turns on E2EE, locks/unlocks with passkey PRF, approves a second admin's device", async ({ browser }) => {
  // Two browsers, two passkeys, the full setup wizard: longer than the default budget.
  test.setTimeout(120_000);
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const violations = collectCspViolations(alice);
  await signInWithNewPasskey(alice, "alice");

  // --- Setup wizard ---
  await expect(alice.getByText("End-to-end encryption is not on yet")).toBeVisible();
  const groups = await turnOnEncryption(alice, "Alice laptop");
  await expect(alice.getByText("Encryption unlocked").first()).toBeVisible();

  // --- Lock / unlock with the passkey (PRF) and survive a reload ---
  await alice.getByRole("button", { name: "Lock" }).first().click();
  await expect(alice.getByRole("heading", { name: "Unlock encryption on this device" })).toBeVisible();
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(alice.getByText("Devices with encryption keys")).toBeVisible();
  await alice.reload();
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(alice.getByText("Devices with encryption keys")).toBeVisible();

  // --- Recovery drill with the paper key (changes nothing) ---
  await alice.getByLabel("Test a recovery key (changes nothing)").fill(groups.join(" "));
  await alice.getByRole("button", { name: "Test", exact: true }).click();
  await expect(alice.getByText(/Recovery key works: it opens the encryption keys/)).toBeVisible();

  // --- Bob sets up his device in another browser; Alice approves it after comparing safety codes ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob");
  await enrollAndApprove(alice, bob, "Bob", "Bob phone");

  // Bob is active, and his keys were already open, so his copies of the workspace key loaded right away.
  await expect(bob.getByText("Bob phone")).toBeVisible();

  // After a reload Bob unlocks with his own passkey.
  await bob.reload();
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bob.getByText("Devices with encryption keys")).toBeVisible();

  expect(violations).toEqual([]);
  await aliceContext.close();
  await bobContext.close();
});
