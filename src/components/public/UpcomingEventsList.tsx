"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { EventCard, eventsHref } from "@/src/components/public/events/EventCard";
import { nextEvents } from "@/src/components/public/events/eventDates";
import { useNow } from "@/src/components/public/events/useNow";
import type { EventCardRecord } from "@/src/lib/events";
import { cn } from "@/src/lib/utils";

type UpcomingEventsListProps = {
  orgSlug: string;
  /** Upcoming events as the server saw them, soonest first, with a few spares; null when they could not be loaded. */
  events: EventCardRecord[] | null;
  limit: number;
  /** When the cached copy was built: the first paint's "now", before the browser's clock takes over (see useNow). */
  renderedAt: number;
};

/**
 * Home "Next events": the cards, or an empty state. Which events are still ahead is decided with the browser's
 * clock, as on the Events page, so a cached copy never shows an event that has already ended (R4 P8).
 */
export function UpcomingEventsList({ orgSlug, events, limit, renderedAt }: UpcomingEventsListProps) {
  const now = useNow(renderedAt);
  const shown = events ? nextEvents(events, now, limit) : [];
  const allEvents = eventsHref(orgSlug);

  if (!shown.length) {
    return (
      <EmptyState
        icon={<CalendarDays aria-hidden="true" />}
        title={events ? "No upcoming events yet" : "We couldn't load the events right now"}
        description={events ? "New events are posted here as soon as they're planned." : "Try again in a moment."}
        action={
          <Button asChild variant="outline" size="lg">
            <Link href={allEvents}>See all events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      {/* Phones: one column. Tablets: two cards side by side (a third would sit alone on a second row, so it waits
          for desktop width). Desktop: three in a row (R4 L6). */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((event, index) => (
          <li key={event.id} className={cn("min-w-0", index === 2 && "md:max-lg:hidden")}>
            <EventCard evt={event} orgSlug={orgSlug} compact flyer={false} headingLevel="h3" />
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
  );
}
