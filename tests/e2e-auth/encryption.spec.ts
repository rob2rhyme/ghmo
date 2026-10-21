import { expect, test, type Page } from "@playwright/test";
import { clearEmulators, collectCspViolations, seedAdmin, signInWithNewPasskey } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

async function readRecoveryKey(page: Page) {
  const groups = await page.getByRole("list", { name: "Recovery key groups" }).locator("li > span:last-child").allTextContents();
  expect(groups).toHaveLength(14);
  return groups;
}

test("super admin turns on E2EE, locks/unlocks with passkey PRF, approves a second admin's device", async ({ browser }) => {
  // Two browsers, two passkeys, the full setup wizard: longer than the default budget.
  test.setTimeout(120_000);
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const violations = collectCspViolations(alice);
  await signInWithNewPasskey(alice, "alice");

  // --- Setup wizard ---
  await expect(alice.getByText("End-to-end encryption is not on yet")).toBeVisible();
  await alice.getByLabel("Name this device").fill("Alice laptop");
  await alice.getByRole("button", { name: "Create keys with my passkey" }).click();
  await alice.getByRole("button", { name: "Create recovery key" }).click();
  const groups = await readRecoveryKey(alice);
  await alice.getByRole("button", { name: "I have written it down" }).click();

  // Re-type the two requested groups.
  for (const field of await alice.getByLabel(/^Group \d+$/).all()) {
    const label = await field.evaluate(el => document.querySelector(`label[for="${el.id}"]`)?.textContent ?? "");
    const index = Number(label.replace("Group ", "")) - 1;
    await field.fill(groups[index]);
  }
  await alice.getByRole("button", { name: "Check" }).click();

  await alice.getByLabel("Trustee 1", { exact: true }).fill("Trustee One");
  await alice.getByLabel("Trustee 2", { exact: true }).fill("Trustee Two");
  await alice.getByText("Trustee One has their own paper copy").click();
  await alice.getByText("Trustee Two has their own paper copy").click();
  await alice.getByRole("button", { name: "Turn on end-to-end encryption" }).click();
  await expect(alice.getByText("End-to-end encryption is on", { exact: true })).toBeVisible({ timeout: 15_000 });
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
  await expect(alice.getByText(/Recovery key works: it opens all 1 key generation/)).toBeVisible();

  // --- Bob sets up his device in another browser ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob");
  await bob.getByLabel("Name this device").fill("Bob phone");
  await bob.getByRole("button", { name: "Create keys with my passkey" }).click();
  await expect(bob.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  const bobCode = (await bob.getByLabel(/^Safety code /).first().textContent())!.trim();
  expect(bobCode).toMatch(/^\d{4} \d{4} \d{4}$/);

  // Alice sees the same safety code, confirms it, approves.
  await alice.reload();
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(alice.getByText("Devices waiting for approval")).toBeVisible();
  await expect(alice.getByLabel(`Safety code ${bobCode}`).first()).toBeVisible();
  const approve = alice.getByRole("button", { name: "Approve device" });
  await expect(approve).toBeDisabled();
  await alice.getByText("I compared this code with Bob and it matches").click();
  await approve.click();
  await expect(alice.getByText("Waiting for approval")).toHaveCount(0);

  // Bob is now active; his keys were already open, so his copies of the workspace key load right away.
  await bob.getByRole("button", { name: "Check again" }).click();
  await expect(bob.getByText("Devices with encryption keys")).toBeVisible();
  await expect(bob.getByText("Bob phone")).toBeVisible();

  // After a reload Bob unlocks with his own passkey.
  await bob.reload();
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bob.getByText("Devices with encryption keys")).toBeVisible();

  expect(violations).toEqual([]);
  await aliceContext.close();
  await bobContext.close();
});
