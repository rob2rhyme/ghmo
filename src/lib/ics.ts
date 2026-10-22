/** iCalendar (RFC 5545) output for public events. Pure, so it can be tested without a server. */

export type IcsEvent = {
  id: string;
  title: string;
  summary?: string;
  location?: string;
  startsAt: number;
  endsAt?: number;
  updatedAt?: number;
  url?: string;
};

const CRLF = "\r\n";

export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines may not exceed 75 octets; continuation lines start with a space. Never splits a UTF-8 character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // The first line may hold 75 octets, continuation lines 74 (one is the leading space).
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildCalendar(events: IcsEvent[], options: { name: string; host: string; now?: number }): string {
  const now = options.now ?? Date.now();
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GHMO//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(options.name)}`];
  for (const event of events) {
    if (!Number.isFinite(event.startsAt)) continue;
    const end = event.endsAt && event.endsAt > event.startsAt ? event.endsAt : event.startsAt + 60 * 60 * 1000;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@${options.host}`,
      `DTSTAMP:${formatUtc(now)}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(end)}`,
      `SUMMARY:${escapeText(event.title)}`
    );
    if (event.summary) lines.push(`DESCRIPTION:${escapeText(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.updatedAt) lines.push(`LAST-MODIFIED:${formatUtc(event.updatedAt)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
