import { expect, test } from "@playwright/test";
import { clearEmulators, seedAdmin, signInWithNewPasskey, waitForStreamedContent } from "./helpers";

/** The dashboard's Site setup card: super admins only, names what is missing, and drops an item once it is fixed. */

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("a super admin sees what to set up; a second super admin clears that item; a plain admin never sees the card", async ({ browser }) => {
  test.setTimeout(120_000);
  const alice = await browser.newPage();
  await signInWithNewPasskey(alice, "alice", "/admin");
  await waitForStreamedContent(alice);
  const card = alice.getByRole("list", { name: "Site setup" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Only one active super admin.")).toBeVisible();
  await expect(card.getByText("Encryption is off.")).toBeVisible();

  await seedAdmin("carol", "Carol", ["super_admin"]);
  await alice.reload();
  await waitForStreamedContent(alice);
  await expect(card.getByText("Encryption is off.")).toBeVisible();
  await expect(card.getByText("Only one active super admin.")).toHaveCount(0);
  await alice.close();

  const bob = await browser.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin");
  await waitForStreamedContent(bob);
  await expect(bob.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(bob.getByRole("list", { name: "Site setup" })).toHaveCount(0);
  await bob.close();
});
