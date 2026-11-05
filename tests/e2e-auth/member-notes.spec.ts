import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent } from "./helpers";

/**
 * Phase 13-B (plan §17): a notes log on a member's profile. The text is encrypted in the browser; who wrote a note and
 * when are plain fields. Notes are append-only: only their author or a super admin can delete one.
 */

const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name, exact: true });
const FAKE_ENVELOPE = { v: 1, epoch: 1, dev: "d".repeat(24), iv: "a".repeat(16), ct: "b".repeat(40), sig: "c".repeat(80) };

async function seedNote(id: string, authorUid: string, authorName: string, minutesAgo: number) {
  await admin().db.doc(`${ORG}/members/m1/notes/${id}`).set({ enc: FAKE_ENVELOPE, authorUid, authorName, createdAt: Timestamp.fromMillis(Date.now() - minutesAgo * 60_000) });
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await admin().db.doc(`${ORG}/members/m1`).set({ name: "Sam Lee", email: "sam@example.org", emailLower: "sam@example.org", status: "active", roles: ["member"] });
});

test("notes are encrypted, newest first with author and date, limited in length, and deletable by the author or a super admin", async ({ page }) => {
  test.setTimeout(240_000);
  const { db } = admin();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  // A note by another admin whose text this device can't open, to show the failure plainly.
  await seedNote("carolnote", "carol", "Carol", 60);
  await nav(page, "Members").click();
  await page.getByRole("link", { name: "Profile of Sam Lee" }).click();
  const notes = main(page).locator("section", { has: page.getByRole("heading", { name: "Notes", exact: true }) });
  await expect(notes.getByText("This note can't be opened on this device.")).toBeVisible();
  await expect(notes.getByText(/Carol · /)).toBeVisible();

  // Add two notes; the newest shows first, each with the author's name.
  await notes.getByLabel("Add a note").fill("Called about the hall booking. Very helpful.");
  await expect(notes.getByText("44 of 2000")).toBeVisible();
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Note added")).toBeVisible();
  await expect(notes.getByText("Called about the hall booking. Very helpful.")).toBeVisible();
  await expect(notes.getByLabel("Add a note")).toHaveValue("");
  await notes.getByLabel("Add a note").fill("Second note:\nspeaks Nepali, prefers evening calls.");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByText(/prefers evening calls/)).toBeVisible();
  const rows = notes.getByRole("list", { name: "Notes" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("prefers evening calls");
  await expect(rows.nth(1)).toContainText("Called about the hall booking");
  await expect(rows.nth(2)).toContainText("Carol");
  await expect(rows.nth(0)).toContainText("Alice · ");

  // Too long is refused in plain words and can't be saved.
  await notes.getByLabel("Add a note").fill("x".repeat(2001));
  await expect(notes.getByText(/A note can be at most 2000 characters\. This one is 2001\./)).toBeVisible();
  await expect(notes.getByRole("button", { name: "Add note" })).toBeDisabled();
  await notes.getByLabel("Add a note").fill("");

  // Ciphertext and plain facts in Firestore; the log holds no text.
  const stored = (await db.collection(`${ORG}/members/m1/notes`).get()).docs.filter(d => d.id !== "carolnote");
  expect(stored).toHaveLength(2);
  for (const doc of stored) {
    expect(doc.data()).toMatchObject({ authorUid: "alice", authorName: "Alice" });
    expect(doc.get("createdAt")).toBeTruthy();
    const raw = JSON.stringify(doc.data());
    for (const secret of ["hall booking", "Nepali", "evening", "helpful"]) expect(raw).not.toContain(secret);
  }
  const audit = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_note_added").get()).docs.map(d => d.data());
  expect(audit).toHaveLength(2);
  expect(JSON.stringify(audit)).not.toMatch(/hall booking|Nepali|evening/);

  // The author deletes their own note, after a confirmation; a super admin deletes someone else's.
  await rows.nth(0).getByRole("button", { name: /^Delete the note from Alice/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(rows).toHaveCount(3);
  await rows.nth(0).getByRole("button", { name: /^Delete the note from Alice/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete note" }).click();
  await expect(rows).toHaveCount(2);
  await expect(notes.getByText(/prefers evening calls/)).toHaveCount(0);
  await rows.getByRole("button", { name: "Delete the note from Carol" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete note" }).click();
  await expect(rows).toHaveCount(1);
  expect((await db.collection(`${ORG}/members/m1/notes`).get()).size).toBe(1);
  const deleted = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_note_deleted").get()).docs.map(d => d.data());
  expect(deleted).toHaveLength(2);
});

test("a plain admin can delete only their own notes, cannot add one without encryption, and nobody can reach a missing member", async ({ page }) => {
  test.setTimeout(120_000);
  const { db } = admin();
  await seedNote("carolnote", "carol", "Carol", 30);
  await seedNote("bobnote", "bob", "Bob", 10);
  await signInWithNewPasskey(page, "bob", "/admin/members/m1");
  await waitForStreamedContent(page);
  const notes = main(page).locator("section", { has: page.getByRole("heading", { name: "Notes", exact: true }) });
  await expect(notes.getByText(/Turn on encryption \(Admin → Encryption\) to add them/)).toBeVisible();
  await expect(notes.getByRole("list", { name: "Notes" }).getByRole("listitem")).toHaveCount(2);
  await expect(notes.getByRole("button", { name: "Delete the note from Bob" })).toBeVisible();
  await expect(notes.getByRole("button", { name: "Delete the note from Carol" })).toHaveCount(0);

  const refused = await page.request.delete("/api/organizations/ghmo/members/m1/notes/carolnote");
  expect(refused.status()).toBe(403);
  expect(((await refused.json()) as { error: string }).error).toBe("Only the person who wrote a note, or a super admin, can delete it.");
  expect((await db.doc(`${ORG}/members/m1/notes/carolnote`).get()).exists).toBe(true);
  expect((await page.request.delete("/api/organizations/ghmo/members/m1/notes/nosuch")).status()).toBe(404);
  const own = await page.request.delete("/api/organizations/ghmo/members/m1/notes/bobnote");
  expect(own.status()).toBe(200);
  expect((await db.doc(`${ORG}/members/m1/notes/bobnote`).get()).exists).toBe(false);

  // Adding needs an encrypted note from an approved device, so with encryption off it is refused.
  const add = await page.request.post("/api/organizations/ghmo/members/m1/notes", { data: { id: "newnote", enc: FAKE_ENVELOPE } });
  expect(add.status()).toBe(400);
  expect((await db.doc(`${ORG}/members/m1/notes/newnote`).get()).exists).toBe(false);
  expect((await page.request.get("/api/organizations/ghmo/members/nope/notes")).status()).toBe(404);
  expect((await page.request.post("/api/organizations/ghmo/members/nope/notes", { data: { id: "n", enc: FAKE_ENVELOPE } })).status()).toBe(404);
  const list = await page.request.get("/api/organizations/ghmo/members/m1/notes");
  expect(((await list.json()) as { notes: { id: string }[] }).notes.map(n => n.id)).toEqual(["carolnote"]);
});
