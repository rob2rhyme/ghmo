import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, enrollAndApprove, seedAdmin, signInWithNewPasskey, turnOnEncryption, waitForStreamedContent } from "./helpers";

/**
 * Phase 9-C (plan §12): a campaign is opened from an event, each caller logs outcomes and RSVPs from
 * My Calls, every attempt lands in the audit log without a number or note, the stored counts always
 * equal the rows, a closed campaign refuses new attempts, and the export holds no numbers.
 */

const ORG = "organizations/ghmo";
const shown = (page: Page, text: string) => page.locator("#admin-main").getByText(text, { exact: true }).filter({ visible: true });
const nav = (page: Page, label: string) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link", { name: label, exact: true }).click();

async function addMember(page: Page, name: string, email: string, phone: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Phone (optional)").fill(phone);
  await page.getByLabel("This person gave their number for community calls.").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(shown(page, name)).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  const event = { title: "General meeting", body: "Agenda to follow", status: "published", startsAt: Timestamp.fromMillis(Date.now() + 14 * 24 * 3600 * 1000) };
  await admin().db.doc(`${ORG}/events/ev1`).set(event);
  await admin().db.doc("organizations/ghmo-site/events/ev1").set(event);
});

test("a campaign from an event: callers log outcomes and RSVPs, counts match the rows, audit and export hold no numbers, closing stops attempts", async ({ browser }) => {
  test.setTimeout(300_000);
  const aliceContext = await browser.newContext();
  const page = await aliceContext.newPage();
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");

  await nav(page, "Members");
  await addMember(page, "Asha Rai", "asha@example.org", "717-555-0101");
  await addMember(page, "Bina Thapa", "bina@example.org", "717-555-0102");
  await addMember(page, "Deepak Gurung", "deepak@example.org", "717-555-0103");

  await nav(page, "Calling tree");
  const callers = page.getByRole("list", { name: "Callers" });
  await callers.getByLabel("Alice").check();
  await callers.getByLabel("Bob").check();
  await page.getByRole("button", { name: "Plan assignments" }).click();
  await page.getByRole("button", { name: "Save calling tree" }).click();
  await expect(page.getByText(/Calling tree saved/)).toBeVisible();

  // --- Open the campaign from the event, with an encrypted script ---
  await nav(page, "Call campaigns");
  await page.getByLabel("Event (optional)").selectOption({ label: "General meeting" });
  await expect(page.getByLabel("Title")).toHaveValue("General meeting");
  await page.getByLabel("Calls done by (optional)").fill("2026-11-14");
  await page.getByLabel("Script and agenda (optional, encrypted)").fill("Saturday 15 Nov, 5 pm at the hall. Agenda: budget, elections, picnic.");
  await page.getByRole("button", { name: "Open campaign" }).click();
  await expect(page.getByText("Campaign opened: 3 people to call")).toBeVisible();
  const { db } = admin();
  const [campaignDoc] = (await db.collection(`${ORG}/callCampaigns`).get()).docs;
  const campaignId = campaignDoc.id;
  const stored = campaignDoc.data();
  expect(stored).toMatchObject({ title: "General meeting", eventId: "ev1", eventTitle: "General meeting", status: "open", createdBy: "alice", treeVersion: 1 });
  expect(stored.counts).toEqual({ total: 3, attempted: 0, reached: 0, done: 0, rsvpYes: 0, rsvpNo: 0, rsvpMaybe: 0 });
  expect(JSON.stringify(stored)).not.toContain("Agenda");
  expect(Object.keys(stored.script).sort()).toEqual(["ct", "dev", "epoch", "iv", "sig", "v"]);
  const calls = () => db.collection(`${ORG}/callCampaigns/${campaignId}/calls`);
  expect((await calls().get()).size).toBe(3);

  // A second open campaign for the same event is refused.
  const dup = await page.evaluate(async () => {
    const res = await fetch("/api/admin/call-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "DUPDUPDUPDUPDUPDUPDU", title: "Again", eventId: "ev1" })
    });
    return res.status;
  });
  expect(dup).toBe(409);

  // --- Alice logs a call from My Calls: reached, coming, with an encrypted note ---
  await nav(page, "My calls");
  await expect(page.getByText("What to say")).toBeVisible();
  await expect(page.getByText("Agenda: budget, elections, picnic.")).toBeVisible();
  const campaignList = page.getByRole("list", { name: "Calls for General meeting" });
  // Read both names before logging anything: rows re-sort once someone is done.
  const rowNames = await campaignList
    .getByRole("button", { name: /^Log call to / })
    .evaluateAll(buttons => buttons.map(button => (button.getAttribute("aria-label") ?? "").replace(/^Log call to /, "").trim()));
  expect(rowNames).toHaveLength(2);
  const [firstName, secondName] = rowNames;
  await page.getByRole("button", { name: `Log call to ${firstName}` }).click();
  await page.getByRole("radio", { name: "Reached", exact: true }).check();
  await page.getByRole("radio", { name: "Coming", exact: true }).check();
  await page.getByLabel("Note (optional, encrypted)").fill("Bringing two guests");
  await page.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText("Logged: Reached")).toBeVisible();
  await expect(campaignList.getByText("Reached · Coming")).toBeVisible();
  await expect(page.locator("#admin-main").getByText(/1 of 2 still to reach\./)).toBeVisible();

  const reachedRow = (await calls().where("outcome", "==", "reached").get()).docs[0];
  expect(reachedRow.data()).toMatchObject({ callerUid: "alice", rsvp: "yes" });
  expect(reachedRow.data().attempts).toHaveLength(1);
  expect(JSON.stringify(reachedRow.data())).not.toContain("guests");
  expect(Object.keys(reachedRow.data().attempts[0].note).sort()).toEqual(["ct", "dev", "epoch", "iv", "sig", "v"]);
  const audit1 = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "call_attempt_recorded").get()).docs[0].data();
  expect(audit1.after).toMatchObject({ memberId: reachedRow.id, outcome: "reached", rsvp: "yes", attempts: 1 });
  expect(JSON.stringify(audit1)).not.toContain("555");
  expect(JSON.stringify(audit1)).not.toContain("guests");

  // A second attempt on the other person: voicemail, no RSVP allowed.
  await page.getByRole("button", { name: `Log call to ${secondName}` }).click();
  await page.getByRole("radio", { name: "Left voicemail" }).check();
  await expect(page.getByRole("radiogroup", { name: "RSVP" })).toHaveCount(0);
  await page.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText("Logged: Left voicemail")).toBeVisible();

  // --- Bob logs his person from his approved device ---
  const bobContext = await browser.newContext();
  const bob = await bobContext.newPage();
  await signInWithNewPasskey(bob, "bob", "/admin/encryption");
  await enrollAndApprove(page, bob, "Bob", "Bob phone");
  await bob.goto("/admin/my-calls");
  await waitForStreamedContent(bob);
  await bob.getByRole("button", { name: "Unlock with passkey" }).click();
  const bobList = bob.getByRole("list", { name: "Calls for General meeting" });
  await expect(bobList.getByRole("listitem")).toHaveCount(1);
  await expect(bob.getByText("Agenda: budget, elections, picnic.")).toBeVisible();
  const bobsPerson = (await bobList.getByRole("button", { name: /^Log call to / }).first().getAttribute("aria-label"))!.replace(/^Log call to /, "").trim();
  await bob.getByRole("button", { name: `Log call to ${bobsPerson}` }).click();
  await bob.getByRole("radio", { name: "Reached", exact: true }).check();
  await bob.getByRole("radio", { name: "Not coming", exact: true }).check();
  await bob.getByRole("button", { name: "Save call" }).click();
  await expect(bob.getByText("Logged: Reached")).toBeVisible();
  await expect(bob.getByText("All done: everyone was reached or finished.")).toBeVisible();

  // Bob cannot log Alice's person, nor see her rows.
  const bobApi = await bob.evaluate(async (args: { campaignId: string; memberId: string }) => {
    const res = await fetch(`/api/admin/call-campaigns/${args.campaignId}/calls/${args.memberId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: "ATTEMPTATTEMPT", outcome: "reached" })
    });
    const mine = await (await fetch("/api/admin/call-campaigns?mine=1")).json();
    return { status: res.status, rows: mine.mine[args.campaignId].calls.length };
  }, { campaignId, memberId: reachedRow.id });
  expect(bobApi.status).toBe(403);
  expect(bobApi.rows).toBe(1);

  // --- Stored counts equal the rows ---
  const rowsNow = (await calls().get()).docs.map(d => d.data());
  const expected = {
    total: rowsNow.length,
    attempted: rowsNow.filter(r => r.attempts.length > 0).length,
    reached: rowsNow.filter(r => r.outcome === "reached").length,
    done: rowsNow.filter(r => ["reached", "declined", "wrong_number"].includes(r.outcome)).length,
    rsvpYes: rowsNow.filter(r => r.rsvp === "yes").length,
    rsvpNo: rowsNow.filter(r => r.rsvp === "no").length,
    rsvpMaybe: rowsNow.filter(r => r.rsvp === "maybe").length
  };
  expect(expected).toEqual({ total: 3, attempted: 3, reached: 2, done: 2, rsvpYes: 1, rsvpNo: 1, rsvpMaybe: 0 });
  expect((await db.doc(`${ORG}/callCampaigns/${campaignId}`).get()).data()!.counts).toEqual(expected);

  // --- The BOD dashboard shows it, exports without numbers, and closes ---
  await page.goto(`/admin/call-campaigns/${campaignId}`);
  await waitForStreamedContent(page);
  // A full page load locks this device's keys again; the campaign page sits behind the encryption gate.
  const unlock = page.getByRole("button", { name: "Unlock with passkey" });
  await expect(unlock.or(page.getByLabel("Reached: 2 / 3"))).toBeVisible();
  if (await unlock.isVisible()) await unlock.click();
  await expect(page.getByLabel("Reached: 2 / 3")).toBeVisible();
  await expect(page.getByRole("table", { name: "Progress per caller" })).toContainText("Alice");
  await expect(page.getByRole("table", { name: "Progress per caller" })).toContainText("Bob");
  await expect(page.getByRole("list", { name: "Not yet reached" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Call log" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Bringing two guests")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download spreadsheet (CSV)" }).click();
  const file = await download;
  const csv = await (await import("node:fs/promises")).readFile(await file.path(), "utf8");
  expect(csv.split("\n")[0]).toBe("Name,Email,Caller,Outcome,RSVP,Attempts,Last attempt");
  expect(csv).toContain("Reached,Coming,1");
  expect(csv).not.toContain("555");
  expect(csv).not.toContain("guests");
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "call_campaign_exported").get()).size).toBe(1);

  await page.getByRole("button", { name: "Close campaign" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close campaign" }).click();
  await expect(page.getByText("Campaign closed")).toBeVisible();
  expect((await db.doc(`${ORG}/callCampaigns/${campaignId}`).get()).data()).toMatchObject({ status: "closed", closedBy: "alice" });
  const afterClose = await bob.evaluate(async (args: { campaignId: string; memberId: string }) => {
    const res = await fetch(`/api/admin/call-campaigns/${args.campaignId}/calls/${args.memberId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: "ATTEMPTCLOSED", outcome: "reached" })
    });
    return res.status;
  }, { campaignId, memberId: (await calls().where("callerUid", "==", "bob").get()).docs[0].id });
  expect(afterClose).toBe(409);
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "call_campaign_closed").get()).size).toBe(1);

  await aliceContext.close();
  await bobContext.close();
});
