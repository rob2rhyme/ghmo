import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "./helpers";

/**
 * Phase 13-C (plan §17): the calls made to a member across campaigns show on their profile, with each attempt's
 * outcome, caller, note and how the call went (polite, neutral or rude). Notes and ratings are encrypted, never in
 * the dashboard, the audit log or a list; a rating is only for a call that reached them; a super admin can clear it.
 */

const ORG = "organizations/ghmo";
const main = (page: Page) => page.locator("#admin-main");
const nav = (page: Page, label: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: label, exact: true }).click();
const DAY = 24 * 3600 * 1000;

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  for (const [id, title, days] of [["ev1", "General meeting", 14], ["ev2", "Annual picnic", 30]] as const) {
    const event = { title, body: "Details", status: "published", startsAt: Timestamp.fromMillis(Date.now() + days * DAY) };
    await admin().db.doc(`${ORG}/events/${id}`).set(event);
    await admin().db.doc(`organizations/ghmo-site/events/${id}`).set(event);
  }
});

async function openCampaign(page: Page, eventTitle: string) {
  await nav(page, "Call campaigns");
  await page.getByLabel("Event (optional)").selectOption({ label: eventTitle });
  await page.getByRole("button", { name: "Open campaign" }).click();
  await expect(page.getByText(/Campaign opened/)).toBeVisible();
}

test("call history on the profile: outcome, caller, note and manner; manner stays out of the dashboard and the log; only a reached call can be rated; a super admin clears it", async ({ browser }) => {
  test.setTimeout(300_000);
  const { db } = admin();
  const aliceContext = await browser.newContext();
  const page = await aliceContext.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  await nav(page, "Members");
  await page.getByLabel("Email", { exact: true }).fill("asha@example.org");
  await page.getByLabel("Name", { exact: true }).fill("Asha Rai");
  await page.locator("#member-phone").fill("717-555-0101");
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(main(page).getByText("Asha Rai", { exact: true }).filter({ visible: true })).toBeVisible();

  await nav(page, "Calling tree");
  await page.getByRole("list", { name: "Callers" }).getByLabel("Alice").check();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved/)).toBeVisible();

  await openCampaign(page, "General meeting");
  await openCampaign(page, "Annual picnic");

  // The rating only appears for a call that reached them.
  await nav(page, "My calls");
  const meeting = page.getByRole("list", { name: "Calls for General meeting" });
  await meeting.getByRole("button", { name: "Log call to Asha Rai" }).click();
  await page.getByRole("radio", { name: "No answer", exact: true }).check();
  await expect(page.getByRole("radiogroup", { name: "Manner" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Reached", exact: true }).check();
  await expect(page.getByRole("radiogroup", { name: "Manner" })).toBeVisible();
  await page.getByRole("radio", { name: "Coming", exact: true }).check();
  await page.getByRole("radio", { name: "Rude", exact: true }).check();
  await page.getByLabel("Note (optional, encrypted)").fill("Bringing two guests");
  await page.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText("Logged: Reached")).toBeVisible();

  const picnic = page.getByRole("list", { name: "Calls for Annual picnic" });
  await picnic.getByRole("button", { name: "Log call to Asha Rai" }).click();
  await page.getByRole("radio", { name: "Reached", exact: true }).check();
  await page.getByRole("radio", { name: "Polite", exact: true }).check();
  await page.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText("Logged: Reached").first()).toBeVisible();

  // Encrypted with the attempt; not in the log, and not in the campaign dashboard's data. Both toasts can be on
  // screen at once, so wait for both attempts to be saved rather than for the toast.
  const readCalls = async () => (await Promise.all((await db.collection(`${ORG}/callCampaigns`).get()).docs.map(c => c.ref.collection("calls").get()))).flatMap(s => s.docs);
  await expect.poll(async () => (await readCalls()).filter(d => (d.get("attempts") ?? []).length > 0).length).toBe(2);
  const callDocs = await readCalls();
  expect(callDocs).toHaveLength(2);
  for (const call of callDocs) {
    const attempt = call.get("attempts")[0];
    expect(Object.keys(attempt.manner).sort()).toEqual(["ct", "dev", "epoch", "iv", "sig", "v"]);
    expect(JSON.stringify(call.data())).not.toMatch(/rude|polite/i);
  }
  const audit = JSON.stringify((await db.collection(`${ORG}/auditLogs`).where("action", "==", "call_attempt_recorded").get()).docs.map(d => d.data()));
  expect(audit).not.toMatch(/rude|polite|manner/i);
  const campaignIds = (await db.collection(`${ORG}/callCampaigns`).get()).docs.map(d => d.id);
  for (const id of campaignIds) {
    const payload = await (await page.request.get(`/api/admin/call-campaigns/${id}`)).text();
    expect(payload).not.toMatch(/manner/i);
  }
  // A rating on a call that did not reach them is refused by the server.
  const firstCampaign = (await db.collection(`${ORG}/callCampaigns`).where("title", "==", "General meeting").get()).docs[0];
  const asha = (await db.collection(`${ORG}/members`).where("emailLower", "==", "asha@example.org").get()).docs[0];
  // The meeting campaign's own attempt (the call records can come back in any order).
  const existing = (await firstCampaign.ref.collection("calls").doc(asha.id).get()).get("attempts")[0];
  const refused = await page.request.post(`/api/admin/call-campaigns/${firstCampaign.id}/calls/${asha.id}`, { data: { attemptId: "attempt-no-answer", outcome: "no_answer", manner: existing.manner } });
  expect(refused.status()).toBe(400);

  // The profile: history across campaigns, newest first, with notes and ratings opened on this device.
  await nav(page, "Members");
  await page.getByRole("link", { name: "Profile of Asha Rai" }).click();
  const calls = main(page).locator("section", { has: page.getByRole("heading", { name: "Calls", exact: true }) });
  await expect(calls.getByTestId("calls-summary")).toHaveText("In 2 campaigns · 2 attempts · reached in 2");
  await expect(calls.getByTestId("manner-summary")).toHaveText("How calls went: 1 polite · 1 rude");
  await expect(calls.getByText("General meeting", { exact: true })).toBeVisible();
  await expect(calls.getByText("Annual picnic", { exact: true })).toBeVisible();
  await expect(calls.getByText("Bringing two guests")).toBeVisible();
  const meetingRow = calls.getByRole("listitem").filter({ hasText: "General meeting" });
  await expect(meetingRow.getByText("Rude", { exact: true })).toBeVisible();
  await expect(meetingRow.getByText("Reached · Coming")).toBeVisible();
  await expect(meetingRow.getByText(/Alice/)).toBeVisible();

  // A plain admin cannot clear a rating.
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/members");
  const forbidden = await bob.request.delete(`/api/admin/call-campaigns/${firstCampaign.id}/calls/${asha.id}/attempts/${existing.id}/manner`);
  expect(forbidden.status()).toBe(403);
  await bobContext.close();

  // A super admin clears it; the call, its outcome and note stay.
  await meetingRow.getByRole("button", { name: /^Clear the rating on the reached call/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear rating" }).click();
  await expect(page.getByText("Rating cleared")).toBeVisible();
  await expect(calls.getByTestId("manner-summary")).toHaveText("How calls went: 1 polite");
  await expect(meetingRow.getByText("Rude", { exact: true })).toHaveCount(0);
  await expect(calls.getByText("Bringing two guests")).toBeVisible();
  const afterClear = (await firstCampaign.ref.collection("calls").doc(asha.id).get()).get("attempts")[0];
  expect(afterClear.manner).toBeUndefined();
  expect(afterClear.note).toBeTruthy();
  const cleared = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "call_manner_cleared").get()).docs.map(d => d.data());
  expect(cleared).toHaveLength(1);
  expect(JSON.stringify(cleared)).not.toMatch(/rude|polite/i);
  const again = await page.request.delete(`/api/admin/call-campaigns/${firstCampaign.id}/calls/${asha.id}/attempts/${existing.id}/manner`);
  expect(again.status()).toBe(409);
});
