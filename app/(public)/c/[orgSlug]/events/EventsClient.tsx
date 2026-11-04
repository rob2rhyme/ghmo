"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarPlus, CalendarX } from "lucide-react";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { RefreshButton } from "@/src/components/states/RefreshButton";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Segmented } from "@/src/components/ui/segmented";
import { EventCard } from "@/src/components/public/events/EventCard";
import { EventsCalendar } from "@/src/components/public/events/EventsCalendar";
import { eventIsOver } from "@/src/components/public/events/eventDates";
import { useNow } from "@/src/components/public/events/useNow";
import type { EventCardRecord } from "@/src/lib/events";

type ViewMode = "list" | "grid" | "calendar";
type StatusFilter = "future" | "past" | "all";

const SHOW_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "future", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" }
];

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
  { value: "calendar", label: "Calendar" }
];

type EventsClientProps = {
  orgSlug: string;
  /** Published events from the server, soonest first; null when they could not be loaded. */
  events: EventCardRecord[] | null;
  /** When the server rendered this (cached) copy: the first paint's "now", before the browser's clock takes over. */
  renderedAt: number;
  /** From getContactEmail on the server; offered when loading fails. */
  contactEmail?: string | null;
};

/** The public events list: the server sends the events, this adds the Show and View switches. */
export default function EventsClient({ orgSlug, events: loadedEvents, renderedAt, contactEmail = null }: EventsClientProps) {
  const loadFailed = loadedEvents === null;
  const events = useMemo(() => loadedEvents ?? [], [loadedEvents]);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<StatusFilter>("future");
  // The page is cached, so "now" comes from the browser's clock once it has loaded (see useNow).
  const now = useNow(renderedAt);

  const { upcoming, past } = useMemo(() => {
    const upcoming: EventCardRecord[] = [];
    const past: EventCardRecord[] = [];
    for (const evt of events) (eventIsOver(evt, now) ? past : upcoming).push(evt);
    // Upcoming soonest first (as loaded); past most recent first.
    return { upcoming, past: past.reverse() };
  }, [events, now]);

  const filtered = filter === "future" ? upcoming : filter === "past" ? past : [...upcoming, ...past];
  const hasEvents = events.length > 0;

  return (
    <PublicPage className="gap-6">
      <PublicPageHeader
        title="Events"
        description="Community gatherings, festivals and meetings. Open an event for the details."
        actions={
          hasEvents ? (
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a calendar file download, not a page */}
              <a href="/api/calendar">
                <CalendarPlus aria-hidden="true" />
                Add all events to your phone&apos;s calendar
              </a>
            </Button>
          ) : null
        }
      />

      {hasEvents ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          <Segmented label="Show" showLabel options={SHOW_OPTIONS} value={filter} onChange={setFilter} />
          <Segmented label="View" showLabel options={VIEW_OPTIONS} value={view} onChange={setView} />
        </div>
      ) : null}

      {loadFailed ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t load the events right now</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              Try again in a moment.
              {contactEmail ? (
                <>
                  {" "}
                  If it keeps happening, email us at{" "}
                  <a href={`mailto:${contactEmail}`} className="font-semibold text-foreground underline underline-offset-4">
                    {contactEmail}
                  </a>
                  .
                </>
              ) : null}
            </p>
            <RefreshButton />
          </AlertDescription>
        </Alert>
      ) : !hasEvents ? (
        <EmptyState icon={<CalendarX />} title="No events yet" description="Events appear here as soon as they are announced. Please check back soon." />
      ) : filtered.length === 0 ? (
        <NoEvents filter={filter} onShow={setFilter} />
      ) : view === "calendar" ? (
        <EventsCalendar events={filtered} orgSlug={orgSlug} />
      ) : filter === "all" && past.length ? (
        // "All": upcoming and past under their own subheadings, so it's clear where the past ones start (R4 L8).
        <div className="flex flex-col gap-8">
          {upcoming.length ? (
            <EventGroup id="events-upcoming" title="Upcoming events">
              <EventList events={upcoming} orgSlug={orgSlug} view={view} headingLevel="h3" />
            </EventGroup>
          ) : null}
          <EventGroup id="events-past" title="Past events">
            <EventList events={past} orgSlug={orgSlug} view={view} headingLevel="h3" past />
          </EventGroup>
        </div>
      ) : (
        <EventList events={filtered} orgSlug={orgSlug} view={view} past={filter === "past"} />
      )}
    </PublicPage>
  );
}

function EventGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <PublicSectionTitle id={id}>{title}</PublicSectionTitle>
      {children}
    </section>
  );
}

function EventList({
  events,
  orgSlug,
  view,
  headingLevel,
  past = false
}: {
  events: EventCardRecord[];
  orgSlug: string;
  view: Exclude<ViewMode, "calendar">;
  headingLevel?: "h2" | "h3";
  past?: boolean;
}) {
  return (
    <ul className={view === "grid" ? "grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex max-w-3xl flex-col gap-4"}>
      {events.map(evt => (
        <li key={evt.id} className="min-w-0">
          <EventCard evt={evt} orgSlug={orgSlug} compact={view === "grid"} past={past} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}

function NoEvents({ filter, onShow }: { filter: StatusFilter; onShow: (filter: StatusFilter) => void }) {
  if (filter === "future") {
    return (
      <EmptyState
        icon={<CalendarX />}
        title="No upcoming events"
        description="New events are listed here as soon as they are announced. See past events to find what happened before."
        action={
          <Button size="lg" variant="outline" onClick={() => onShow("past")}>
            See past events
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<CalendarX />}
      title="No past events yet"
      description="Events move here after they happen."
      action={
        <Button size="lg" variant="outline" onClick={() => onShow("future")}>
          See upcoming events
        </Button>
      }
    />
  );
}
