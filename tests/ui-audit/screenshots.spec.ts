import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
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
  ["admin-security", "/admin/security"]
];

async function seed() {
  const { db } = admin();
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  const org = db.doc("organizations/ghmo");
  await org.collection("minutes").doc("m1").set({
    eventId: "ev1",
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
  for (const [id, title, summary, inDays, location] of events) {
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

async function shoot(page: Page, name: string, url: string, { unlock = false } = {}) {
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
