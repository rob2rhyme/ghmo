import { describe, expect, it } from "vitest";
import {
  attachmentDisposition,
  flyerAsciiFileName,
  flyerContent,
  flyerFileName,
  toAscii
} from "@/app/api/organizations/[orgSlug]/events/[eventId]/announcement.pdf/flyer";

const NY = "America/New_York";
// Sat, Dec 12, 2026, 7:00 PM and 9:00 PM in New York (EST, UTC-5).
const start = Date.UTC(2026, 11, 13, 0, 0);
const end = Date.UTC(2026, 11, 13, 2, 0);

/** What a browser does with the header: prefer filename*, decoded from UTF-8. */
function savedName(header: string): string {
  const star = /filename\*=UTF-8''([^;]+)/.exec(header);
  return star ? decodeURIComponent(star[1]) : (/filename="([^"]*)"/.exec(header)?.[1] ?? "");
}

/** A header value must be Latin-1 (Node's fetch Headers throws otherwise, which was the 500). */
function isValidHeaderValue(value: string): boolean {
  try {
    new Headers({ "Content-Disposition": value });
    return /^[\x20-\x7e]*$/.test(value);
  } catch {
    return false;
  }
}

describe("event flyer download name", () => {
  it('is "<title> flyer.pdf"', () => {
    expect(flyerFileName("Dashain celebration")).toBe("Dashain celebration flyer.pdf");
    expect(flyerFileName("  ")).toBe("Event flyer.pdf");
    expect(flyerFileName(undefined)).toBe("Event flyer.pdf");
    expect(flyerFileName('Picnic: "family" day / 2026')).toBe("Picnic family day 2026 flyer.pdf");
  });

  it("keeps a Devanagari title in filename* and gives an ASCII fallback", () => {
    const title = "दशैं महोत्सव २०२६";
    const header = attachmentDisposition(flyerFileName(title), flyerAsciiFileName(title));
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).toContain('filename="Event flyer.pdf"');
    expect(savedName(header)).toBe("दशैं महोत्सव २०२६ flyer.pdf");
  });

  it("handles a phone's curly apostrophe and an en dash", () => {
    const title = "Children’s day – picnic";
    const header = attachmentDisposition(flyerFileName(title), flyerAsciiFileName(title));
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).toContain(`filename="Children's day - picnic flyer.pdf"`);
    expect(savedName(header)).toBe("Children’s day – picnic flyer.pdf");
    // RFC 5987: the apostrophe and brackets are percent-encoded too.
    expect(attachmentDisposition("a'(b).pdf")).toContain("filename*=UTF-8''a%27%28b%29.pdf");
  });

  it("makes accented and mixed titles readable in ASCII", () => {
    expect(toAscii("Tihār – Café “night”")).toBe("Tihar - Cafe night");
    expect(flyerAsciiFileName("दशैं 2026")).toBe("2026 flyer.pdf");
  });
});

describe("event flyer content", () => {
  const event = {
    id: "ev1",
    title: "Dashain celebration",
    summary: "Food, music and tika",
    body: "",
    startsAt: start,
    endsAt: end,
    timezone: NY,
    location: "Community hall"
  };

  it("says When once, with the time range and zone, and Where", () => {
    const content = flyerContent(event, "https://ghmo.example");
    expect(content.when).toEqual({ date: "Sat, Dec 12, 2026", time: "7:00 PM – 9:00 PM EST" });
    expect(content.where).toBe("Community hall");
    expect(content.pageUrl).toBe("https://ghmo.example/c/ghmo/events/ev1");
  });

  it("leaves out empty sections and a missing site address", () => {
    const content = flyerContent({ ...event, body: "   ", location: "", summary: undefined, startsAt: null, endsAt: null }, null);
    expect(content.details).toBeNull();
    expect(content.where).toBeNull();
    expect(content.summary).toBeNull();
    expect(content.when).toBeNull();
    expect(content.pageUrl).toBeNull();
  });
});
