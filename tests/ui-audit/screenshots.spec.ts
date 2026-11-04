import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey, turnOnEncryption } from "../e2e-auth/helpers";

const OUT = process.env.UI_AUDIT_OUT ?? "ui-audit-screens";
const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 }
];
const THEMES = ["light", "dark"] as const;
// Optional: UI_AUDIT_ONLY=home,admin-dashboard captures just those pages.
const ONLY = new Set((process.env.UI_AUDIT_ONLY ?? "").split(",").map(s => s.trim()).filter(Boolean));
const wanted = (name: string) => ONLY.size === 0 || ONLY.has(name);

const PUBLIC_PAGES = [
  ["home", "/"],
  ["donate", "/donate"],
  ["gumba-project", "/gumba-project"],
  ["multimedia", "/multimedia"],
  ["minutes", "/minutes"],
  ["minutes-detail", "/minutes/m1"],
  ["document-generator-public", "/document-generator"],
  ["verify-unknown", "/verify/NOTACODE"],
  ["member-events", "/c/ghmo/events"],
  ["member-event-detail", "/c/ghmo/events/ev1"],
  ["event-past-with-minutes", "/c/ghmo/events/ev4"],
  ["event-past-no-minutes", "/c/ghmo/events/ev5"],
  ["onboarding-docs", "/docs/onboarding"],
  ["login", "/login"],
  ["admin-login-signed-out", "/admin/login"],
  ["unsubscribe-bad-link", "/unsubscribe?token=bad"],
  ["not-found", "/this-page-does-not-exist"]
];

const ADMIN_PAGES = [
  ["admin-dashboard", "/admin"],
  ["admin-minutes", "/admin/minutes"],
  ["admin-comms", "/admin/comms"],
  ["admin-chat", "/admin/chat"],
  ["admin-events", "/admin/events"],
  ["admin-events-new", "/admin/events/new"],
  ["admin-events-edit", "/admin/events/ev1/edit"],
  ["admin-action-items", "/admin/action-items"],
  ["admin-members", "/admin/members"],
  ["admin-broadcasts", "/admin/broadcasts"],
  ["admin-calling-tree", "/admin/calling-tree"],
  ["admin-call-campaigns", "/admin/call-campaigns"],
  ["admin-my-calls", "/admin/my-calls"],
  ["admin-document-generator", "/admin/document-generator"],
  ["admin-document-gallery", "/admin/document-gallery"],
  ["admin-gumba-project", "/admin/gumba-project"],
  ["admin-encryption", "/admin/encryption"],
  ["admin-security", "/admin/security"],
  // Public event pages as an admin sees them: minutes status and "Add minutes" load in the browser.
  ["admin-view-event-past-with-minutes", "/c/ghmo/events/ev4"],
  ["admin-view-event-past-no-minutes", "/c/ghmo/events/ev5"]
];

async function seed() {
  const { db } = admin();
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  const org = db.doc("organizations/ghmo");
  await org.collection("minutes").doc("m1").set({
    eventId: "ev4",
    eventTitle: "Spring general meeting",
    eventDate: Timestamp.fromMillis(now - 30 * day),
    meetingType: "General",
    recordedBy: "Alice Rai",
    status: "approved",
    approvedAt: Timestamp.fromMillis(now - 25 * day),
    createdAt: Timestamp.fromMillis(now - 30 * day),
    agenda: ["Welcome and introductions", "Treasurer's report", "Dashain festival planning", "Gumba Project update"],
    decisions: ["Dashain celebration on 10 October at the community hall", "Raise the Gumba Project goal to $50,000"],
    actionItems: [
      { task: "Book the community hall", assignedTo: "Bikash", dueDate: Timestamp.fromMillis(now - 5 * day) },
      { task: "Send the festival flyer to members", assignedTo: "Sita", dueDate: Timestamp.fromMillis(now + 7 * day) }
    ],
    attendance: { present: ["Alice Rai", "Bikash Thapa", "Sita Gurung", "Ram Magar"], absent: ["Hari Pun"] }
  });
  await org.collection("minutes").doc("m2").set({
    eventTitle: "October board meeting",
    eventDate: Timestamp.fromMillis(now - 2 * day),
    meetingType: "Board",
    recordedBy: "Alice Rai",
    status: "draft",
    createdAt: Timestamp.fromMillis(now - 2 * day),
    agenda: ["Budget"],
    decisions: [],
    actionItems: []
  });
  const events = [
    ["ev1", "Dashain celebration", "Food, music and tika for the whole community.", 12, "Community hall, 100 Main St"],
    ["ev2", "General meeting", "Quarterly meeting for all members. Agenda inside.", 26, "Online (Zoom)"],
    ["ev3", "Youth football day", "Bring water and boots.", 40, "City Island park"]
  ] as const;
  // Past events: one with approved minutes (m1), one without (a football day has no minutes).
  const pastEvents = [
    ["ev4", "Spring general meeting", "Quarterly meeting for all members.", -30, "Community hall, 100 Main St"],
    ["ev5", "Summer picnic", "Games and food for families.", -10, "City Island park"]
  ] as const;
  for (const [id, title, summary, inDays, location] of [...events, ...pastEvents]) {
    await org.collection("events").doc(id).set({
      title,
      summary,
      description: `${summary} Everyone is welcome. Please RSVP so we can plan food and seating.`,
      status: "published",
      startsAt: Timestamp.fromMillis(now + inDays * day),
      location,
      createdAt: Timestamp.fromMillis(now - day)
    });
  }
  const people = ["Bikash Thapa", "Sita Gurung", "Ram Magar", "Hari Pun", "Maya Rana", "Dil Ale"];
  for (const [i, name] of people.entries()) {
    const email = `${name.split(" ")[0].toLowerCase()}@example.org`;
    await org.collection("members").doc(`mem${i}`).set({
      name,
      email,
      emailLower: email,
      status: "active",
      roles: ["member"],
      createdAt: Timestamp.fromMillis(now - (i + 1) * day)
    });
  }
  const audit = [
    ["minutes_approved", "Minutes approved: Spring general meeting", 3],
    ["event_created", "Event created: Dashain celebration", 26],
    ["members_imported", "6 members imported", 50]
  ] as const;
  for (const [action, summary, hoursAgo] of audit) {
    await org.collection("auditLogs").add({
      action,
      resource: { summary },
      actor: { name: "Alice Rai", role: "super_admin" },
      createdAt: Timestamp.fromMillis(now - hoursAgo * 3600_000)
    });
  }
}

async function shoot(page: Page, name: string, url: string, { unlock = false, before }: { unlock?: boolean; before?: (page: Page) => Promise<void> } = {}) {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(t => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme).catch(() => undefined);
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 10_000 });
      } catch {
        // Pages with long-lived connections never go idle; take what has loaded.
      }
      if (unlock) {
        // A full page load forgets this device's keys; unlock the way an admin would.
        const button = page.getByRole("button", { name: "Unlock with passkey" });
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          await button.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
        }
      }
      if (before) await before(page).catch(() => undefined);
      await page.waitForTimeout(600);
      const dir = path.join(OUT, size.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}--${theme}.png`), fullPage: true });
    }
  }
}

test.beforeAll(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice Rai", ["super_admin"]);
  await seed();
});

test("public, member and sign-in pages", async ({ page }) => {
  await page.goto("/");
  for (const [name, url] of PUBLIC_PAGES) if (wanted(name)) await shoot(page, name, url);
});

test("events list, past and all", async ({ page }) => {
  // The Show switch is not in the address, so pick it the way a visitor would.
  for (const show of ["Past", "All"]) {
    const name = `member-events-${show.toLowerCase()}`;
    if (!wanted(name)) continue;
    await shoot(page, name, "/c/ghmo/events", {
      before: p => p.getByRole("group", { name: "Show" }).getByRole("button", { name: show }).click()
    });
  }
});

test("admin pages", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin");
  for (const [name, url] of ADMIN_PAGES) if (wanted(name)) await shoot(page, name, url);
});

/** Pages whose look changes once end-to-end encryption is on (how the site looks after launch). */
const ENCRYPTED_PAGES = new Set([
  "admin-encryption",
  "admin-dashboard",
  "admin-minutes",
  "admin-comms",
  "admin-chat",
  "admin-action-items",
  "admin-members",
  "admin-calling-tree",
  "admin-call-campaigns",
  "admin-my-calls",
  "admin-document-generator"
]);

test("open menus on a phone", async ({ page }) => {
  if (ONLY.size && !ONLY.has("menus")) return;
  await page.setViewportSize({ width: 375, height: 812 });
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/", { waitUntil: "load" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForTimeout(500);
    fs.mkdirSync(path.join(OUT, "phone"), { recursive: true });
    await page.screenshot({ path: path.join(OUT, "phone", `menu-public--${theme}.png`) });
  }
  await signInWithNewPasskey(page, "alice", "/admin");
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/admin", { waitUntil: "load" });
    await page.getByRole("button", { name: "Open admin menu" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "phone", `menu-admin--${theme}.png`) });
  }
});

// The certificate steps run before encryption is turned on: with it on, a newly signed-in device is locked out of
// the document generator until another device approves it.
test("signing page states", async ({ page }) => {
  const sessions = await seedSigningSessions();
  for (const [state, session] of Object.entries(sessions)) {
    const name = `sign-${state}`;
    if (wanted(name)) await shoot(page, name, `/sign/${session.id}`);
  }
});

/**
 * The document generator's Review step with a two-page wedding certificate, then the whole issuing flow: a
 * signature is requested (which assigns the certificate number), signed on another device, and the certificate
 * finalized, so the check page has a real record to show ("found", then revoked).
 */
test("certificate: review step, signing and the check page", async ({ page, browser }) => {
  if (ONLY.size && !["admin-docgen-review-wedding", "verify-found", "verify-revoked", "sign-signed"].some(name => ONLY.has(name))) return;
  test.setTimeout(10 * 60_000);
  await signInWithNewPasskey(page, "alice", "/admin/document-generator");
  await shoot(page, "admin-docgen-review-wedding", "/admin/document-generator", { before: fillLongWedding });

  // Issue it for real at desktop size.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/document-generator", { waitUntil: "load" });
  await fillLongWedding(page);
  const { db } = admin();
  const before = new Set((await db.collection("signingSessions").get()).docs.map(doc => doc.id));
  await page.getByRole("button", { name: "Request signature", exact: true }).first().click();
  let sessionId = "";
  await expect
    .poll(async () => {
      sessionId = (await db.collection("signingSessions").get()).docs.map(doc => doc.id).find(id => !before.has(id)) ?? "";
      return sessionId;
    })
    .not.toBe("");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const signer = await (await browser.newContext()).newPage();
  await signer.goto(`/sign/${sessionId}`);
  const canvas = signer.locator("canvas");
  await canvas.waitFor();
  const box = (await canvas.boundingBox())!;
  await signer.mouse.move(box.x + 30, box.y + 120);
  await signer.mouse.down();
  await signer.mouse.move(box.x + 90, box.y + 40, { steps: 8 });
  await signer.mouse.move(box.x + 160, box.y + 130, { steps: 8 });
  await signer.mouse.move(box.x + 240, box.y + 60, { steps: 8 });
  await signer.mouse.up();
  await signer.getByRole("button", { name: "Submit signature" }).click();
  await signer.getByText("Signature received. Thank you.").waitFor();
  await page.getByText("Signed", { exact: true }).first().waitFor({ timeout: 20_000 });
  if (wanted("admin-docgen-review-wedding")) {
    fs.mkdirSync(path.join(OUT, "desktop"), { recursive: true });
    await page.screenshot({ path: path.join(OUT, "desktop", "admin-docgen-review-wedding-signed--light.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Finalize & save signed certificate" }).click();
  await page.getByText(/Signed PDF saved/).waitFor({ timeout: 60_000 });

  const certificates = await db.collection("certificates").get();
  const record = certificates.docs[0];
  if (wanted("verify-found")) await shoot(signer, "verify-found", `/verify/${record.id}`);
  if (wanted("sign-signed")) await shoot(signer, "sign-signed", `/sign/${sessionId}`);
  // The status is not part of the record's signature, so a revoked record still checks out as GHMO's.
  await record.ref.update({ status: "revoked" });
  if (wanted("verify-revoked")) await shoot(signer, "verify-revoked", `/verify/${record.id}`);
});

test("admin pages with encryption on", async ({ page }) => {
  if (ONLY.size && !ONLY.has("encrypted")) return;
  await signInWithNewPasskey(page, "alice", "/admin/encryption");
  await turnOnEncryption(page, "Alice laptop");
  for (const [name, url] of ADMIN_PAGES) {
    if (!ENCRYPTED_PAGES.has(name)) continue;
    await shoot(page, `enc-${name}`, url);
    await shoot(page, `encu-${name}`, url, { unlock: true });
  }
});

/** A wedding certificate long enough to run onto a second page (a long custom blessing and a Maiti section). */
const LONG_WEDDING: Array<[label: string, value: string, kind?: "select"]> = [
  ["Date of issue / जारी मिति", "2026-11-04"],
  ["Groom's name / दुलहाको नाम", "Saurav Thapa Magar"],
  ["Bride's name / दुलहीको नाम", "Amrita Gurung"],
  ["Bride's community / दुलहीको समुदाय", "Gurung|गुरुङ", "select"],
  ["Maiti representative's name / माइती प्रतिनिधिको नाम", "Hari Bahadur Rana Magar"],
  [
    "Maiti acknowledgment (optional) / माइती स्वीकृति (वैकल्पिक)",
    "The Maiti family welcomed the bride with tika and blessings, in front of both families and the community elders."
  ],
  ["Marriage date / विवाह मिति", "2026-11-04"],
  ["Place of ceremony / विवाह स्थान", "Glenwood Garden, 4300 Derry Street, Harrisburg, PA"],
  [
    "Custom blessing (optional) / वैकल्पिक आशीर्वाद",
    Array.from(
      { length: 4 },
      () =>
        "May your home be full of laughter, your table full of friends, and your days full of patience and kindness for each other. May both families stand by you in every season of life."
    ).join("\n")
  ],
  ["Witness 1 name / साक्षी १ नाम", "Dil Bahadur Pun Magar"],
  ["Witness 2 name / साक्षी २ नाम", "Maya Rana Magar"],
  ["Officiant's name / संस्कार सम्पन्न गराउने", "Dipak Thapa Magar"],
  ["Officiant's title / पद", "Community elder"]
];

/** Opens the wedding certificate, fills every step, and stops on the Review step. */
async function fillLongWedding(page: Page) {
  // Phones choose the template from a list; wider screens from buttons.
  const picker = page.getByLabel("Template", { exact: true });
  if (await picker.isVisible().catch(() => false)) await picker.selectOption("wedding-certificate");
  else await page.getByRole("button", { name: /Wedding certificate/i }).first().click({ timeout: 30_000 });
  for (let step = 0; step < 8; step++) {
    for (const [label, value, kind] of LONG_WEDDING) {
      const control = page.getByLabel(label, { exact: true });
      if (!(await control.isVisible().catch(() => false))) continue;
      if (kind === "select") await control.selectOption(value);
      else await control.fill(value);
    }
    const next = page.getByRole("button", { name: "Next", exact: true });
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click({ timeout: 30_000 });
  }
  await page.getByRole("button", { name: "Save to gallery" }).waitFor({ timeout: 30_000 });
  // Both letter pages are drawn once the letterhead has loaded.
  await page.getByText(/Page 2 of/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
}

/** Signing requests seeded straight into the database, one per state the signer can see. */
async function seedSigningSessions() {
  const { db } = admin();
  const day = 24 * 3600 * 1000;
  const id = () => crypto.randomBytes(32).toString("hex");
  const sessions = {
    pending: { id: id(), status: "pending", expiresAt: new Date(Date.now() + day) },
    expired: { id: id(), status: "pending", expiresAt: new Date(Date.now() - day) },
    used: { id: id(), status: "finalized", expiresAt: new Date(Date.now() - day) }
  };
  for (const session of Object.values(sessions)) {
    await db.collection("signingSessions").doc(session.id).set({
      status: session.status,
      role: "witness1",
      certificateId: "GHMO-2026-001",
      documentTitle: "Wedding certificate",
      createdAt: new Date(),
      expiresAt: session.expiresAt,
      createdByUid: "alice"
    });
  }
  return sessions;
}
