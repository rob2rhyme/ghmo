import "server-only";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PublicSectionTitle } from "@/src/components/public/PublicPage";
import { EventCard, eventsHref } from "@/src/components/public/events/EventCard";
import { eventStart } from "@/src/components/public/events/eventDates";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import type { EventRecord } from "@/src/lib/events.shared";
import { cachedPageData } from "@/src/lib/publicCache.server";
import { getPublishedEvents } from "@/src/lib/publicData.server";

/** Up to `limit` published upcoming events, soonest first; null when they could not be loaded. */
async function loadUpcomingEvents(limit: number): Promise<EventRecord[] | null> {
  const events = cachedPageData(await getPublishedEvents(), "Upcoming events");
  if (!events) return null;
  const now = Date.now();
  return events.filter(event => (eventStart(event)?.getTime() ?? now) >= now).slice(0, limit);
}

/** Home page "Next events": up to three published upcoming events, as the same cards as the Events page. */
export async function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const events = await loadUpcomingEvents(limit);
  const allEvents = eventsHref(COMMUNITY_SLUG);

  return (
    <section aria-labelledby="home-events" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <PublicSectionTitle id="home-events">Next events</PublicSectionTitle>
        <p className="text-base text-muted-foreground">Come and join us. Everyone is welcome.</p>
      </div>

      {events?.length ? (
        <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
            {events.map(event => (
              <li key={event.id} className="min-w-0">
                <EventCard evt={event} orgSlug={COMMUNITY_SLUG} compact flyer={false} headingLevel="h3" />
              </li>
            ))}
          </ul>
          <Button asChild variant="ghost" size="lg" className="-ml-3 self-start px-3">
            <Link href={allEvents}>
              See all events
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      ) : (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" />}
          title={events ? "No upcoming events yet" : "Events couldn't be loaded right now"}
          description={events ? "New events are posted here as soon as they're planned." : "Please try again in a little while."}
          action={
            <Button asChild variant="outline" size="lg">
              <Link href={allEvents}>See all events</Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
