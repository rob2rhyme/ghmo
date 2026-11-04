import { eventWhenLong } from "@/src/components/public/events/eventDates";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import type { EventRecord } from "@/src/lib/events.shared";

/**
 * What goes on an event's flyer, and how the download is named (R4 S2, C6). Kept apart from the PDF drawing so
 * the wording and the header can be tested without rendering a PDF.
 */

export type FlyerContent = {
  title: string;
  summary: string | null;
  /** The date once, then the time range with its zone; null when the date isn't set yet. */
  when: { date: string; time: string } | null;
  where: string | null;
  /** The event's longer text; null when there is none, so no empty heading is drawn. */
  details: string | null;
  /** The event page, on the configured site address; null when no address is known. */
  pageUrl: string | null;
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export function flyerContent(
  event: Pick<EventRecord, "id" | "title" | "summary" | "body" | "startsAt" | "endsAt" | "timezone" | "location">,
  origin: string | null
): FlyerContent {
  return {
    title: text(event.title) ?? "Event",
    summary: text(event.summary),
    when: eventWhenLong(event),
    where: text(event.location),
    details: text(event.body),
    pageUrl: origin ? `${origin}/c/${COMMUNITY_SLUG}/events/${encodeURIComponent(event.id)}` : null
  };
}

/** "<title> flyer.pdf", without characters that file systems refuse. */
export function flyerFileName(title: unknown): string {
  const cleaned = (text(title) ?? "Event")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return `${cleaned || "Event"} flyer.pdf`;
}

/** Plain-ASCII stand-ins for the punctuation phones and word processors type. */
const ASCII_PUNCTUATION: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201b": "'",
  "\u201c": "",
  "\u201d": "",
  "\u201e": "",
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00a0": " "
};

/** The text with accents dropped, typed punctuation made plain and anything else outside printable ASCII left out. */
export function toAscii(value: string): string {
  return value
    .replace(/[\u2018-\u201e\u2013\u2014\u2026\u00a0]/g, ch => ASCII_PUNCTUATION[ch] ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The flyer's name for clients that only read the plain `filename`: a title in another script becomes "Event". */
export function flyerAsciiFileName(title: unknown): string {
  return flyerFileName(toAscii(text(title) ?? ""));
}

/** RFC 5987 encoding for `filename*`: percent-encoded UTF-8, including the characters encodeURIComponent leaves. */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Content-Disposition for a download whose name may hold any character. A header value must be Latin-1, so a
 * raw Nepali title or a ’ made the response fail (R4 S2): `filename` carries an ASCII fallback and `filename*`
 * the real name, which every current browser uses.
 */
export function attachmentDisposition(fileName: string, asciiFallback: string = toAscii(fileName)): string {
  return `attachment; filename="${toAscii(asciiFallback) || "download"}"; filename*=UTF-8''${rfc5987(fileName)}`;
}
