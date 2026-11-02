import { expect, test } from "@playwright/test";
import { admin, clearEmulators, collectCspViolations, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

const SECRET = "Quietly buy the old hall on Friday at 6pm";
const BEFORE = "Plain note from before encryption";

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

type Page = import("@playwright/test").Page;

/** A chat bubble with this text (not the compose box, which holds the text while sending). */
const bubble = (page: Page, text: string) => page.locator("p", { hasText: text });

async function send(page: Page, text: string) {
  await page.getByPlaceholder("Share an update or ask for help...").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bubble(page, text)).toBeVisible();
  await expect(page.getByPlaceholder("Share an update or ask for help...")).toHaveValue("");
}

test("chat is plaintext until encryption is on, then stored as ciphertext and readable only after unlock", async ({ browser }) => {
  test.setTimeout(180_000);
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const violations = collectCspViolations(alice);
  await signInWithNewPasskey(alice, "alice", "/admin/chat");

  // --- Before encryption: works as before, with a visible reminder ---
  await expect(alice.getByText("Records on this page aren't extra-locked yet.")).toBeVisible();
  await send(alice, BEFORE);

  // --- Turn encryption on; the earlier message stays readable (legacy plaintext) ---
  await turnOnEncryption(alice, "Alice laptop");
  // In-app navigation keeps the keys unlocked (a full page load would lock the device).
  await alice.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Admin Chat" }).click();
  await expect(bubble(alice, BEFORE)).toBeVisible();

  // --- New messages are encrypted ---
  await send(alice, SECRET);

  const { db } = admin();
  const messages = (await db.collection("organizations/ghmo/adminChatMessages").get()).docs.map(d => ({ id: d.id, ...d.data() }));
  expect(messages).toHaveLength(2);
  const encrypted = messages.find(m => "enc" in m)!;
  const legacy = messages.find(m => !("enc" in m))!;
  expect(legacy).toMatchObject({ body: BEFORE });
  expect(encrypted).not.toHaveProperty("body");
  expect(encrypted).toMatchObject({ enc: { v: 1, epoch: 1 }, createdBy: { uid: "alice" } });
  expect(JSON.stringify(encrypted)).not.toContain("old hall");
  expect(JSON.stringify(encrypted)).not.toContain("6pm");

  // The audit log records that a message was sent, never what it said.
  const audit = JSON.stringify((await db.collection("organizations/ghmo/auditLogs").get()).docs.map(d => d.data()));
  expect(audit).toContain("admin_chat_message_sent");
  expect(audit).not.toContain("old hall");
  expect(audit).not.toContain(BEFORE);

  // --- A reload locks the device: the page asks to unlock instead of showing messages ---
  await alice.reload();
  await expect(alice.getByText("Unlock to see admin chat")).toBeVisible();
  await expect(bubble(alice, SECRET)).toHaveCount(0);
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bubble(alice, SECRET)).toBeVisible();
  await expect(bubble(alice, BEFORE)).toBeVisible();

  // --- Bob enrols a device, is approved, and reads the same conversation ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(alice, bob, "Bob", "Bob phone");
  await bob.goto("/admin/chat");
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bubble(bob, SECRET)).toBeVisible();

  // Alice reopens the chat (approving Bob took her to the Encryption page and a reload locks the device).
  await alice.goto("/admin/chat");
  await alice.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(bubble(alice, SECRET)).toBeVisible();
  await send(bob, "Agreed. I will bring the paperwork.");

  // Alice sees Bob's reply live, decrypted.
  await expect(bubble(alice, "Agreed. I will bring the paperwork.")).toBeVisible({ timeout: 15_000 });

  expect(violations).toEqual([]);
  await aliceContext.close();
  await bobContext.close();
});
