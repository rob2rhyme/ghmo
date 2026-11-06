import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * The activity log page (plan §29, 22-A): newest first, 50 at a time, filtered by person, area and dates; device
 * details and the download only for super admins; the download is itself logged; nothing is ever changed.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const start = Date.UTC(2026, 9, 1, 15);

async function seedLog() {
  const col = db.collection(`${ORG}/auditLogs`);
  // Signing in writes entries of its own, newer than these; start from an empty log so the order is known.
  for (const doc of (await col.get()).docs) await doc.ref.delete();
  const batch = db.batch();
  // 60 member changes by Bob, one a day before them a minutes approval by Alice and a sign-in.
  for (let i = 0; i < 60; i += 1) {
    batch.set(col.doc(`m${String(i).padStart(2, "0")}`), {
      action: "member_updated",
      actor: { uid: "bob", name: "Bob", role: "admin" },
      resource: { type: "member", id: "mem1" },
      before: { name: "Asha", status: "active" },
      after: { name: "Asha Rai", status: "active" },
      meta: { ip: "203.0.113.9", userAgent: "Chrome on Mac", route: "/x" },
      createdAt: new Date(start + (i + 2) * 3600_000)
    });
  }
  batch.set(col.doc("approve"), { action: "minutes_approved", actor: { uid: "alice", name: "Alice", role: "super_admin" }, resource: { type: "meeting_minutes", id: "n1", summary: "Approved minutes for Board call" }, meta: { ip: "198.51.100.7" }, createdAt: new Date(start + 3600_000) });
  batch.set(col.doc("signin"), { action: "login", actor: { uid: "alice", name: "Alice", role: "super_admin" }, resource: { summary: "passkey" }, createdAt: new Date(start - 24 * 3600_000) });
  await batch.commit();
}

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
});

test("any admin reads the log page by page and by filter; device details are left out for them", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "bob", "/admin");
  await seedLog();
  const get = async (query = "") => {
    const res = await page.request.get(`/api/admin/activity${query}`);
    return { status: res.status(), body: (await res.json()) as { entries: Record<string, unknown>[]; nextBeforeMs: number | null; superAdmin: boolean; people?: { uid: string; name: string }[]; error?: string } };
  };

  const first = await get();
  expect(first.status).toBe(200);
  expect(first.body.superAdmin).toBe(false);
  expect(first.body.entries).toHaveLength(50);
  expect(first.body.entries[0]).toMatchObject({ id: "m59", action: "member_updated", area: "members", person: "Bob", href: "/admin/members/mem1", changes: [{ field: "name", before: "Asha", after: "Asha Rai" }] });
  expect(first.body.entries[0]).not.toHaveProperty("device");
  expect(JSON.stringify(first.body)).not.toContain("203.0.113.9");
  expect(first.body.people?.map(p => p.name)).toEqual(["Alice", "Bob"]);

  // Load older: the rest, then nothing more.
  const second = await get(`?before=${first.body.nextBeforeMs}`);
  expect(second.body.entries.map(e => e.id)).toEqual([...Array.from({ length: 10 }, (_, i) => `m${String(9 - i).padStart(2, "0")}`), "approve", "signin"]);
  expect(second.body.nextBeforeMs).toBeNull();
  expect(second.body).not.toHaveProperty("people");

  // By person, by area, by both, by dates.
  expect((await get("?person=alice")).body.entries.map(e => e.id)).toEqual(["approve", "signin"]);
  expect((await get("?area=minutes")).body.entries.map(e => e.id)).toEqual(["approve"]);
  expect((await get("?area=security")).body.entries.map(e => e.id)).toEqual(["signin"]);
  expect((await get("?person=alice&area=minutes")).body.entries.map(e => e.id)).toEqual(["approve"]);
  expect((await get("?person=bob&area=minutes")).body.entries).toEqual([]);
  expect((await get("?to=2026-09-30")).body.entries.map(e => e.id)).toEqual(["signin"]);
  expect((await get("?from=2026-10-01&to=2026-10-01")).body.entries.map(e => e.id).slice(-1)).toEqual(["approve"]);

  // Bad filters are refused in words; a plain admin can't download.
  expect((await get("?area=nope")).status).toBe(400);
  expect((await get("?from=10/01/2026")).status).toBe(400);
  expect((await get("?from=2026-10-02&to=2026-10-01")).body.error).toContain("start date is after");
  expect((await page.request.post("/api/admin/activity/export", { data: {} })).status()).toBe(403);
});

test("a super admin sees device details and downloads the filtered log, and the download is logged", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithNewPasskey(page, "alice", "/admin");
  await seedLog();
  const res = await page.request.get("/api/admin/activity?area=minutes");
  const body = (await res.json()) as { superAdmin: boolean; entries: { device?: { ip: string | null } }[] };
  expect(body.superAdmin).toBe(true);
  expect(body.entries[0].device).toEqual({ ip: "198.51.100.7", userAgent: null });

  const download = await page.request.post("/api/admin/activity/export", { data: { person: "bob" } });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("text/csv");
  const csv = await download.text();
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe("When,Person,Role,What,Detail,Area,Internet address,Browser");
  expect(lines).toHaveLength(61);
  expect(lines[1]).toContain("Bob,Admin,Bob updated a member");
  expect(lines[1]).toContain("203.0.113.9");

  const logged = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "activity_exported").get()).docs;
  expect(logged).toHaveLength(1);
  expect(logged[0].get("resource.summary")).toBe("60 entries (one person)");
  // Nothing in the log was changed or removed.
  expect((await db.collection(`${ORG}/auditLogs`).where("action", "==", "member_updated").get()).size).toBe(60);
});
