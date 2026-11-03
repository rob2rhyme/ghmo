"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarPlus, CalendarX } from "lucide-react";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Segmented } from "@/src/components/ui/segmented";
import { EventCard, EventCardSkeleton } from "@/src/components/public/events/EventCard";
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

/** The public events list. `contactEmail` (from getContactEmail on the server) is offered when loading fails. */
export default function EventsClient({ contactEmail = null }: { contactEmail?: string | null }) {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || "ghmo";
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // "Now" for the Upcoming/Past split, taken when the list loads (keeps rendering pure).
  const [loadedAt, setLoadedAt] = useState(0);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<StatusFilter>("future");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const res = await fetch(`/api/organizations/${orgSlug}/events`);
        const data = await res.json();
        if (!res.ok) throw new Error(`Events request failed (${res.status})`);
        setEvents(data.events || []);
        setLoadedAt(Date.now());
      } catch (err) {
        console.error(err);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [orgSlug, attempt]);

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

      {loading ? (
        <div role="status" aria-live="polite" className="grid gap-4 sm:grid-cols-2">
          <span className="sr-only">Loading events…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      ) : loadFailed ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>We couldn&apos;t load events</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              Check your internet connection and try again.
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
            <Button size="lg" onClick={() => setAttempt(n => n + 1)}>
              Try again
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
