import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, CalendarX, Clock, MapPin } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EventActions, EventPassedNote } from "@/src/components/public/events/EventActions";
import { eventsHref as eventsListHref } from "@/src/components/public/events/EventCard";
import { EventMinutesCard } from "@/src/components/public/events/EventMinutesCard";
import { eventEnd, eventStart, eventWhenLong } from "@/src/components/public/events/eventDates";
import { COMMUNITY_NAME, COMMUNITY_SLUG } from "@/src/lib/community";
import { getApprovedMinutesForEvent, getPublishedEvent } from "@/src/lib/publicData.server";
import { absoluteUrl, pageOpenGraph } from "@/src/lib/siteMetadata";
import { eventJsonLd, jsonLdText } from "@/src/lib/structuredData";

// Built on first visit and refreshed every 5 minutes, or at once when the event or its minutes change
// (publicCache.server.ts). Nothing here depends on who is looking: admin extras load in the browser.
export const revalidate = 300;

/** No copies at build time: each event page is built on its first visit, then served from the cache. */
export function generateStaticParams(): { orgSlug: string; eventId: string }[] {
  return [];
}

type Params = { params: Promise<{ orgSlug: string; eventId: string }> };

/** The event, or null when it isn't published here. A failed read throws, so the cache keeps its last good copy. */
async function loadEvent(orgSlug: string, eventId: string) {
  if (orgSlug !== COMMUNITY_SLUG) return null;
  const event = await getPublishedEvent(eventId);
  if (event === undefined) throw new Error("Event could not be read");
  return event;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { orgSlug, eventId } = await params;
  const event = await loadEvent(orgSlug, eventId);
  if (!event) return { title: "Event not available · GHMO", robots: { index: false, follow: true } };
  const when = eventWhenLong(event);
  const fallback = [when ? `${when.date}, ${when.time}` : null, event.location].filter(Boolean).join(" · ");
  const description = event.summary?.trim() || fallback || undefined;
  // Link previews (Facebook, Viber, WhatsApp) show the event's own title and summary.
  return { title: `${event.title} · GHMO`, description, openGraph: pageOpenGraph(event.title, description), alternates: { canonical: `/c/${COMMUNITY_SLUG}/events/${encodeURIComponent(event.id)}` } };
}

export default async function EventDetailPage({ params }: Params) {
  const { orgSlug, eventId } = await params;
  const eventsHref = eventsListHref(orgSlug);
  const event = await loadEvent(orgSlug, eventId);

  if (!event) {
    return (
      <MessagePage
        icon={<CalendarX />}
        title="This event isn't available"
        description="It may have been removed, or it hasn't been announced yet."
        actions={
          <Button asChild size="lg">
            <Link href={eventsHref}>See all events</Link>
          </Button>
        }
      />
    );
  }

  const when = eventWhenLong(event);
  // Visitors only ever see approved minutes (null: none yet). A failed read throws, so the cache keeps serving
  // its last good copy of this page instead of one without the minutes link.
  const approvedMinutes = await getApprovedMinutesForEvent(event.id);
  if (approvedMinutes === undefined) throw new Error("The event's minutes could not be read");
  // eslint-disable-next-line react-hooks/purity -- when this cached copy was built; the browser switches to its own clock (useNow)
  const renderedAt = Date.now();
  const timing = { id: event.id, startsAt: event.startsAt, endsAt: event.endsAt };
  const structured = eventJsonLd(
    { title: event.title, summary: event.summary, location: event.location, start: eventStart(event), end: eventEnd(event), url: absoluteUrl(`/c/${COMMUNITY_SLUG}/events/${encodeURIComponent(event.id)}`) },
    { name: COMMUNITY_NAME, url: absoluteUrl("/") }
  );

  return (
    <PublicPage width="reading" className="gap-6">
      {/* For search engines: the event's date and place. */}
      {structured ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(structured) }} /> : null}
      <PublicPageHeader back={{ href: eventsHref, label: "All events" }} title={<span className="break-words">{event.title}</span>} />

      <EventPassedNote event={timing} renderedAt={renderedAt} />

      <Card className="gap-3">
        <h2 className="sr-only">When and where</h2>
        {when ? (
          <>
            <p className="flex items-start gap-3 text-base">
              <CalendarDays className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">{when.date}</span>
            </p>
            <p className="flex items-start gap-3 text-base">
              <Clock className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">{when.time}</span>
            </p>
          </>
        ) : (
          <p className="flex items-start gap-3 text-base">
            <CalendarDays className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Date to be announced</span>
          </p>
        )}
        {event.location ? (
          <p className="flex items-start gap-3 text-base">
            <MapPin className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words">{event.location}</span>
          </p>
        ) : null}
      </Card>

      {event.summary ? <p className="text-lg text-foreground/90">{event.summary}</p> : null}

      {event.body?.trim() ? <p className="whitespace-pre-wrap break-words text-base text-foreground">{event.body}</p> : null}

      <EventActions event={timing} renderedAt={renderedAt} orgSlug={orgSlug} />

      <EventMinutesCard event={timing} approvedMinutesId={approvedMinutes?.id || null} renderedAt={renderedAt} />
    </PublicPage>
  );
}
