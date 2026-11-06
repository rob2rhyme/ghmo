import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  ensureOrgSlug,
  eventCollectionPaths,
  eventsCollectionPath,
  normalizeEvent,
  primaryEventsPath,
  toEventCard,
  toPublicEvent
} from "@/src/lib/events";
import type { EventRecord } from "@/src/lib/events.shared";

type Snapshot = Parameters<typeof normalizeEvent>[0];

const snapshot = (id: string, data: Record<string, unknown> | undefined): Snapshot => ({ id, data: () => data }) as unknown as Snapshot;

const startsAt = new Date("2026-12-01T18:00:00Z");
const endsAt = new Date("2026-12-01T20:00:00Z");

/** An event carrying every field, including the private ones. */
const fullEvent: EventRecord = {
  id: "evt1",
  title: "Lhosar",
  summary: "New year celebration",
  body: "Full description",
  status: "published",
  startsAt,
  endsAt,
  timezone: "America/Chicago",
  location: "Community hall",
  featured: true,
  announcementDocTemplate: "tpl-1",
  announcementPdfSource: { generator: "document-generator", docType: "eventAnnouncement", payloadVersion: 2 },
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
  createdByUid: "admin-uid-123"
};

const PRIVATE_FIELDS = ["announcementDocTemplate", "announcementPdfSource", "createdAt", "updatedAt", "createdByUid"];

describe("normalizeEvent", () => {
  it("fills defaults for an empty document", () => {
    expect(normalizeEvent(snapshot("abc", {}))).toEqual({
      id: "abc",
      title: "Untitled Event",
      summary: undefined,
      body: "",
      status: "draft",
      startsAt: undefined,
      endsAt: undefined,
      timezone: DEFAULT_TIMEZONE,
      location: undefined,
      featured: undefined,
      announcementDocTemplate: undefined,
      announcementPdfSource: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      createdByUid: undefined
    });
  });

  it("treats a missing document (data() undefined) like an empty one", () => {
    const event = normalizeEvent(snapshot("gone", undefined));
    expect(event.id).toBe("gone");
    expect(event.title).toBe("Untitled Event");
    expect(event.status).toBe("draft");
    expect(event.timezone).toBe("America/New_York");
  });

  it("uses the document id, not an id stored in the data", () => {
    expect(normalizeEvent(snapshot("real", { id: "forged" })).id).toBe("real");
  });

  it("keeps stored values and drops unknown fields", () => {
    const { id: _id, ...stored } = fullEvent;
    void _id;
    const event = normalizeEvent(snapshot("evt1", { ...stored, secretNote: "do not leak", attendees: ["a"] }));
    expect(event).toEqual(fullEvent);
    expect(event).not.toHaveProperty("secretNote");
    expect(event).not.toHaveProperty("attendees");
  });

  it("replaces empty title, body and status with the defaults", () => {
    const event = normalizeEvent(snapshot("x", { title: "", body: "", status: "", timezone: "" }));
    expect(event.title).toBe("Untitled Event");
    expect(event.body).toBe("");
    expect(event.status).toBe("draft");
    expect(event.timezone).toBe(DEFAULT_TIMEZONE);
  });
});

describe("toPublicEvent", () => {
  it("keeps exactly the public fields", () => {
    const pub = toPublicEvent(fullEvent);
    expect(Object.keys(pub).sort()).toEqual(
      ["id", "title", "summary", "body", "status", "startsAt", "endsAt", "timezone", "location", "featured"].sort()
    );
    expect(pub).toEqual({
      id: "evt1",
      title: "Lhosar",
      summary: "New year celebration",
      body: "Full description",
      status: "published",
      startsAt,
      endsAt,
      timezone: "America/Chicago",
      location: "Community hall",
      featured: true
    });
  });

  it("drops the creator uid, flyer settings and timestamps", () => {
    const pub = toPublicEvent(fullEvent);
    for (const field of PRIVATE_FIELDS) expect(pub, field).not.toHaveProperty(field);
  });

  it("drops extra fields smuggled in at runtime", () => {
    const pub = toPublicEvent({ ...fullEvent, internalNotes: "x" } as EventRecord);
    expect(pub).not.toHaveProperty("internalNotes");
  });

  it("does not modify the input", () => {
    const copy = { ...fullEvent };
    toPublicEvent(copy);
    expect(copy).toEqual(fullEvent);
  });
});

describe("toEventCard", () => {
  it("keeps only what a card shows", () => {
    const card = toEventCard(fullEvent);
    expect(Object.keys(card).sort()).toEqual(["id", "title", "summary", "startsAt", "endsAt", "timezone", "location", "featured"].sort());
    expect(card).toEqual({
      id: "evt1",
      title: "Lhosar",
      summary: "New year celebration",
      startsAt,
      endsAt,
      timezone: "America/Chicago",
      location: "Community hall",
      featured: true
    });
  });

  it("drops body, status and every private field", () => {
    const card = toEventCard(fullEvent);
    for (const field of ["body", "status", ...PRIVATE_FIELDS]) expect(card, field).not.toHaveProperty(field);
  });

  it("is the same whether built from the full or the public event", () => {
    expect(toEventCard(toPublicEvent(fullEvent))).toEqual(toEventCard(fullEvent));
  });
});

describe("event collection paths", () => {
  it("defaults to the community slug", () => {
    expect(eventsCollectionPath()).toBe("organizations/ghmo/events");
    expect(eventsCollectionPath("")).toBe("organizations/ghmo/events");
    expect(eventsCollectionPath("other")).toBe("organizations/other/events");
  });

  it("lists the new location first, then the legacy ones", () => {
    expect(eventCollectionPaths()).toEqual(["organizations/ghmo/events", "organizations/ghmo-site/events", "community/ghmo-site/events"]);
    expect(primaryEventsPath()).toBe("organizations/ghmo/events");
  });

  it("recognizes only the community slug", () => {
    expect(ensureOrgSlug("ghmo")).toBe(true);
    expect(ensureOrgSlug("ghmo-site")).toBe(false);
    expect(ensureOrgSlug("")).toBe(false);
  });
});
