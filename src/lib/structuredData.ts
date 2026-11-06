/**
 * schema.org data for search engines (JSON-LD), so an event can show with its date and place in search results.
 * Only fields the public page already shows; serialised so it can never close the <script> tag it sits in.
 */

export type EventLd = { title: string; summary?: string | null; location?: string | null; start: Date | null; end: Date | null; url: string | null };

export function eventJsonLd(event: EventLd, organizer: { name: string; url: string | null }): Record<string, unknown> | null {
  if (!event.start) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.start.toISOString(),
    ...(event.end && event.end.getTime() > event.start.getTime() ? { endDate: event.end.toISOString() } : {}),
    ...(event.summary?.trim() ? { description: event.summary.trim() } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.location?.trim() ? { location: { "@type": "Place", name: event.location.trim(), address: event.location.trim() } } : {}),
    ...(event.url ? { url: event.url } : {}),
    organizer: { "@type": "Organization", name: organizer.name, ...(organizer.url ? { url: organizer.url } : {}) }
  };
}

export function organizationJsonLd(org: { name: string; alternateName: string; url: string | null; logo: string | null }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    alternateName: org.alternateName,
    ...(org.url ? { url: org.url } : {}),
    ...(org.logo ? { logo: org.logo } : {})
  };
}

/** JSON for a <script type="application/ld+json">: "<" is escaped so text such as "</script>" can't end the tag. */
export function jsonLdText(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
