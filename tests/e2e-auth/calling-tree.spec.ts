import { expect, test, type Page } from "@playwright/test";
import { admin, clearEmulators, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/**
 * Phase 9-B (plan §12): a super admin picks the callers and plans an equal split in the browser (the
 * household lives inside the encrypted contact); the server stores member → caller only; each caller's
 * My Calls page shows just their own people, with numbers decrypted on that device.
 */

const ORG = "organizations/ghmo";
const shown = (page: Page, text: string) => page.locator("#admin-main").getByText(text, { exact: true }).filter({ visible: true });

/** Adds a member with a number and call consent through the Members page (encrypted in the browser). */
async function addMember(page: Page, name: string, email: string, phone: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name (optional)").fill(name);
  await page.getByLabel("Phone (optional)").fill(phone);
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  // Toasts stack up, so wait for the person to appear in the list and the form to clear.
  await expect(shown(page, name)).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["admin"]);
});

test("a super admin plans an equal split, a caller sees only their own people, and a manual move sticks", async ({ browser }) => {
  test.setTimeout(240_000);
  const aliceContext = await browser.newContext();
  const page = await aliceContext.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  // Five callable members plus one without consent (never assigned).
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  const people = [
    ["Asha Rai", "asha@example.org", "717-555-0101"],
    ["Bina Thapa", "bina@example.org", "717-555-0102"],
    ["Deepak Gurung", "deepak@example.org", "717-555-0103"],
    ["Ekta Magar", "ekta@example.org", "717-555-0104"],
    ["Firoz Pun", "firoz@example.org", "717-555-0105"]
  ] as const;
  for (const [name, email, phone] of people) await addMember(page, name, email, phone);
  await page.getByLabel("Email", { exact: true }).fill("noconsent@example.org");
  await page.getByLabel("Name (optional)").fill("No Consent");
  await page.getByLabel("Phone (optional)").fill("717-555-0199");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, "No Consent")).toBeVisible();

  // --- Plan the tree with Alice and Bob as callers ---
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Calling Tree" }).click();
  await expect(page.locator("#admin-main").getByText(/5 of 6 members can be called .* Version 0\./)).toBeVisible();
  const callers = page.getByRole("list", { name: "Callers" });
  await callers.getByLabel("Alice").check();
  await callers.getByLabel("Bob").check();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await expect(page.getByRole("list", { name: "Planned changes" }).getByRole("listitem")).toHaveCount(5);
  await expect(shown(page, "Everyone callable has a caller.")).toBeVisible();
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved \(v1\): 5 added, 0 moved, 0 removed/)).toBeVisible();

  const { db } = admin();
  const tree = (await db.doc(`${ORG}/callingTree/current`).get()).data()!;
  expect(tree).toMatchObject({ callers: ["alice", "bob"], version: 1, updatedBy: "alice" });
  const assignments = (await db.collection(`${ORG}/callingTree/current/assignments`).get()).docs.map(d => ({ id: d.id, ...(d.data() as { callerUid: string; assignedBy: string }) }));
  expect(assignments).toHaveLength(5);
  const perCaller = assignments.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.callerUid]: (acc[a.callerUid] ?? 0) + 1 }), {});
  expect(Object.values(perCaller).sort()).toEqual([2, 3]);
  expect(assignments.every(a => a.assignedBy === "auto")).toBe(true);
  expect(JSON.stringify(assignments)).not.toContain("555");
  const noConsent = (await db.collection(`${ORG}/members`).where("emailLower", "==", "noconsent@example.org").get()).docs[0];
  expect(assignments.some(a => a.id === noConsent.id)).toBe(false);

  // --- Audit holds counts, not names or numbers ---
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "calling_tree_updated").get()).docs[0].data();
  expect(audit.after).toMatchObject({ version: 1, added: 5, moved: 0, removed: 0 });
  expect(JSON.stringify(audit)).not.toContain("Asha");

  // --- Move one person by hand; only that one changes ---
  const bobList = page.getByRole("list", { name: "People assigned to Bob" });
  await bobList.getByRole("combobox", { name: /^Caller for / }).first().selectOption("alice");
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved \(v2\): 0 added, 1 moved, 0 removed/)).toBeVisible();
  const movedDocs = (await db.collection(`${ORG}/callingTree/current/assignments`).where("assignedBy", "==", "alice").get()).docs;
  expect(movedDocs).toHaveLength(1);
  expect(movedDocs[0].get("callerUid")).toBe("alice");

  // --- Bob sees only his people, decrypted on his approved device ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(page, bob, "Bob", "Bob phone");
  await bob.goto("/admin/my-calls");
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  // After the hand move Bob has exactly one person left (the 3/2 split gave him two).
  const bobCount = (await db.collection(`${ORG}/callingTree/current/assignments`).where("callerUid", "==", "bob").get()).size;
  expect(bobCount).toBe(1);
  const bobsPeople = bob.getByRole("list", { name: "Your call list" }).getByRole("listitem");
  await expect(bobsPeople).toHaveCount(bobCount);
  await expect(bob.locator("#admin-main").getByText(/•••-•••-01\d\d/).first()).toBeVisible();
  const firstName = (await bobsPeople.first().locator("p").first().textContent())!.trim();
  await bob.getByRole("button", { name: `Show ${firstName}'s number` }).click();
  await expect(bob.getByRole("link", { name: `Call ${firstName}` })).toHaveAttribute("href", /^tel:\+1717555010\d$/);

  // The API gives Bob only his own slice, and refuses to let him change the tree.
  const bobApi = await bob.evaluate(async () => {
    const mine = await (await fetch("/api/admin/calling-tree/mine")).json();
    const tree = await (await fetch("/api/admin/calling-tree")).json();
    const put = await fetch("/api/admin/calling-tree", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callers: ["bob"], assignments: [] }) });
    return { mine: mine.members.length, treeAssignments: tree.assignments.length, total: tree.total, superAdmin: tree.me.superAdmin, putStatus: put.status };
  });
  expect(bobApi.mine).toBe(bobCount);
  expect(bobApi.treeAssignments).toBe(bobCount);
  expect(bobApi.total).toBe(5);
  expect(bobApi.superAdmin).toBe(false);
  expect(bobApi.putStatus).toBe(403);

  // --- Carol is not a caller ---
  const carolContext = await browser.newContext();
  const carol = await carolContext.newPage();
  await signInWithNewPasskey(carol, "carol", "/admin/encryption");
  await enrollAndApprove(page, carol, "Carol", "Carol phone");
  await carol.goto("/admin/my-calls");
  await carol.getByRole("button", { name: "Unlock with passkey" }).click();
  await expect(carol.getByText("You are not on the caller list")).toBeVisible();

  await aliceContext.close();
  await bobContext.close();
  await carolContext.close();
});

test("removing a caller moves only that caller's people, and a call opt-out drops someone from the tree", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  for (let i = 1; i <= 4; i += 1) await addMember(page, `Person ${i}`, `p${i}@example.org`, `717-555-02${String(i).padStart(2, "0")}`);

  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Calling Tree" }).click();
  const callers = page.getByRole("list", { name: "Callers" });
  await callers.getByLabel("Alice").check();
  await callers.getByLabel("Bob").check();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/5 added|4 added/)).toBeVisible();
  const { db } = admin();
  const col = db.collection(`${ORG}/callingTree/current/assignments`);
  const before = Object.fromEntries((await col.get()).docs.map(d => [d.id, d.get("callerUid") as string]));
  const bobs = Object.entries(before).filter(([, uid]) => uid === "bob").map(([id]) => id);
  expect(bobs).toHaveLength(2);

  // Bob leaves the caller list.
  await callers.getByLabel("Bob").uncheck();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await expect(page.getByRole("list", { name: "Planned changes" }).getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved \(v2\): 0 added, 2 moved, 0 removed/)).toBeVisible();
  const after = Object.fromEntries((await col.get()).docs.map(d => [d.id, d.get("callerUid") as string]));
  expect(Object.values(after).every(uid => uid === "alice")).toBe(true);
  for (const [id, uid] of Object.entries(before)) if (uid === "alice") expect(after[id]).toBe("alice");

  // Someone asks not to be called: the next plan drops them and My Calls skips them straight away.
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Members" }).click();
  await page.getByRole("button", { name: "They asked not to be called" }).first().click();
  await expect(shown(page, "Asked not to be called")).toBeVisible();
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "My Calls" }).click();
  await expect(page.getByText(/1 left out \(asked not to be called, or no number\)/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Your call list" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: "Calling Tree" }).click();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await expect(page.getByRole("list", { name: "Planned changes" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("removed (can no longer be called)")).toBeVisible();
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved \(v3\): 0 added, 0 moved, 1 removed/)).toBeVisible();
  expect((await col.get()).size).toBe(3);
  await context.close();
});
