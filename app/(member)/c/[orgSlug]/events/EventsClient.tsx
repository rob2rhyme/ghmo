"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, CalendarX } from "lucide-react";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Segmented } from "@/src/components/ui/segmented";
import { EventCard } from "@/src/components/public/events/EventCard";
import { EventsCalendar } from "@/src/components/public/events/EventsCalendar";
import { eventStart } from "@/src/components/public/events/eventDates";
import type { EventRecord } from "@/src/lib/events.shared";

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
  events: EventRecord[] | null;
  /** "Now" for the Upcoming/Past split, from the server render (keeps rendering pure). */
  loadedAt: number;
  /** From getContactEmail on the server; offered when loading fails. */
  contactEmail?: string | null;
};

/** The public events list: the server sends the events, this adds the Show and View switches. */
export default function EventsClient({ orgSlug, events: loadedEvents, loadedAt, contactEmail = null }: EventsClientProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const loadFailed = loadedEvents === null;
  const events = useMemo(() => loadedEvents ?? [], [loadedEvents]);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<StatusFilter>("future");

  const filtered = useMemo(() => {
    const now = loadedAt;
    if (filter === "all") return events;
    if (filter === "future") {
      return events.filter(evt => (eventStart(evt)?.getTime() ?? now) >= now);
    }
    // Most recent first for past events.
    return events.filter(evt => (eventStart(evt)?.getTime() ?? 0) < now).reverse();
  }, [events, filter, loadedAt]);

  return (
    <PublicPage className="gap-6">
      <PublicPageHeader
        title="Events"
        description="Community gatherings, festivals and meetings. Open an event for the details."
        actions={
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a calendar file download, not a page */}
            <a href="/api/calendar">
              <CalendarPlus aria-hidden="true" />
              Add all events to your phone&apos;s calendar
            </a>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
        <Segmented label="Show" showLabel options={SHOW_OPTIONS} value={filter} onChange={setFilter} />
        <Segmented label="View" showLabel options={VIEW_OPTIONS} value={view} onChange={setView} />
      </div>

      {loadFailed ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t load events</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              The events can&apos;t be read right now. Try again in a moment.
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
            <Button size="lg" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : filtered.length === 0 ? (
        <NoEvents filter={filter} onShow={setFilter} />
      ) : view === "calendar" ? (
        <EventsCalendar events={filtered} orgSlug={orgSlug} />
      ) : (
        <ul className={view === "grid" ? "grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex max-w-3xl flex-col gap-4"}>
          {filtered.map(evt => (
            <li key={evt.id} className="min-w-0">
              <EventCard evt={evt} orgSlug={orgSlug} compact={view === "grid"} />
            </li>
          ))}
        </ul>
      )}
    </PublicPage>
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
  if (filter === "past") {
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
  return <EmptyState icon={<CalendarX />} title="No events yet" description="Events appear here as soon as they are announced. Please check back soon." />;
}
