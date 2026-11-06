import { expect, test } from "@playwright/test";
import { admin, clearEmulators, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Minutes for any meeting (plan §26, 19-A): draft minutes move to another past meeting without minutes, taking its
 * title and date; anything else is refused in plain words; the activity log names both meetings.
 */
const ORG = "organizations/ghmo";
const { db } = admin();
const day = (iso: string) => new Date(iso);

test.beforeEach(async () => {
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["admin"]);
  const event = (title: string, startsAt: Date, status = "published") => ({ title, startsAt, status, body: "", createdAt: new Date() });
  await db.doc(`${ORG}/events/e1`).set(event("Wrong meeting", day("2026-10-01T23:00:00Z")));
  await db.doc(`${ORG}/events/e2`).set(event("Board call", day("2026-10-05T23:00:00Z"), "draft"));
  await db.doc(`${ORG}/events/e3`).set(event("Has minutes", day("2026-10-09T23:00:00Z")));
  await db.doc(`${ORG}/events/e4`).set(event("Next month", day("2099-01-01T23:00:00Z")));
  const minutes = (eventId: string, eventTitle: string, status: string) => ({ eventId, eventTitle, eventDate: day("2026-10-01T23:00:00Z"), meetingType: "board", status, agenda: ["Budget"], createdAt: new Date(), updatedAt: new Date() });
  await db.doc(`${ORG}/minutes/m1`).set(minutes("e1", "Wrong meeting", "draft"));
  await db.doc(`${ORG}/minutes/m3`).set(minutes("e3", "Has minutes", "approved"));
});

test("draft minutes move to the right meeting; every guard holds", async ({ page }) => {
  await signInWithNewPasskey(page, "alice", "/admin/minutes");
  const move = (id: string, eventId: string) => page.request.post("/api/admin/minutes/move", { data: { id, eventId } });

  // Refusals, each in words, and nothing changes.
  for (const [id, eventId, status, words] of [
    ["m1", "e3", 409, "already has minutes"],
    ["m1", "e4", 400, "already happened"],
    ["m1", "e1", 400, "already belong"],
    ["m1", "nope", 404, "wasn't found"],
    ["m3", "e2", 409, "Return them to draft"],
    ["zz", "e2", 404, "not found"]
  ] as const) {
    const res = await move(id, eventId);
    expect(res.status(), `${id} → ${eventId}`).toBe(status);
    expect((await res.json()).error).toContain(words);
  }
  expect((await db.doc(`${ORG}/minutes/m1`).get()).get("eventId")).toBe("e1");

  // The move: the new meeting's title and date come along; the content stays.
  const res = await move("m1", "e2");
  expect(res.status()).toBe(200);
  const moved = (await db.doc(`${ORG}/minutes/m1`).get()).data()!;
  expect(moved).toMatchObject({ eventId: "e2", eventTitle: "Board call", status: "draft", agenda: ["Budget"] });
  expect(moved.eventDate.toDate().toISOString()).toBe("2026-10-05T23:00:00.000Z");
  // e1 is free again.
  expect((await move("m1", "e1")).status()).toBe(200);

  const entries = (await db.collection(`${ORG}/auditLogs`).where("action", "==", "minutes_moved").get()).docs.map(d => d.get("resource.summary"));
  expect(entries).toEqual(expect.arrayContaining(["Moved minutes from Wrong meeting to Board call", "Moved minutes from Board call to Wrong meeting"]));
});
