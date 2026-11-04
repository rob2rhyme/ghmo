import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/** The signed device log: the browser notices when the database disagrees with it. */
test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
});

test("a device slipped into the database without a signed entry is refused", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  // The log covers the workspace and its fingerprint is shown.
  await page.goto("/admin/encryption");
  await expect(page.getByText("Device list checked")).toBeVisible({ timeout: 20_000 });

  // Someone with database access adds an extra "active" device and a mismatched record.
  const { db } = admin();
  const devices = db.collection("organizations/ghmo/e2ee/state/devices");
  const existing = (await devices.get()).docs[0];
  await devices.doc("rogue_device_0000000000").set({ ...existing.data(), deviceId: "rogue_device_0000000000", uid: "alice", name: "Rogue", status: "active" });

  await page.reload();
  await expect(page.getByText("Encryption is paused: the device list failed its check").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Unlock with passkey" })).toHaveCount(0);
});
