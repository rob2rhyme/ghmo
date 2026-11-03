import "server-only";
import { buildCalendar, type IcsEvent } from "./ics";
import type { EventRecord } from "./events.shared";

const toMs = (value: unknown): number | undefined => {
  if (!value) return undefined;
  const raw = typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate() : (value as string | number | Date);
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : undefined;
};

export function toIcsEvent(event: EventRecord, origin: string): IcsEvent | null {
  const startsAt = toMs(event.startsAt);
  if (startsAt === undefined) return null;
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    location: event.location,
    startsAt,
    endsAt: toMs(event.endsAt),
    updatedAt: toMs(event.updatedAt),
    url: `${origin}/c/ghmo/events/${event.id}`
  };
}

export function calendarResponse(events: EventRecord[], origin: string, fileName: string) {
  const items = events.map(event => toIcsEvent(event, origin)).filter((item): item is IcsEvent => item !== null);
  const body = buildCalendar(items, { name: "GHMO Events", host: new URL(origin).host });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${fileName}"`,
      // Calendar apps poll on their own schedule; the CDN keeps a copy for one minute and never serves it stale,
      // so an unpublished event leaves the feed quickly.
      "Cache-Control": "public, max-age=300, s-maxage=60"
    }
  });
}
