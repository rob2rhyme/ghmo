import "server-only";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { DEFAULT_TIMEZONE, type EventRecord } from "@/src/lib/events.shared";
import { formatDateTime, toDate, type DateInput } from "@/src/lib/format";
import { internalFetch } from "@/src/lib/internalFetch";

const EVENTS_HREF = "/c/ghmo/events" as Route;

/** Up to `limit` published upcoming events, soonest first; null when they could not be loaded. */
async function loadUpcomingEvents(limit: number): Promise<EventRecord[] | null> {
  try {
    const res = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/events?status=future`);
    if (!res.ok) return null;
    const { events } = (await res.json()) as { events?: EventRecord[] };
    return (events ?? []).slice(0, limit);
  } catch {
    return null;
  }
}

function DateBadge({ value, timeZone }: { value: DateInput; timeZone: string }) {
  const date = toDate(value);
  if (!date) {
    return (
      <span className="grid size-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <CalendarDays className="size-6" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex size-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
      <span className="text-sm font-semibold leading-none">{date.toLocaleDateString("en-US", { month: "short", timeZone })}</span>
      <span className="text-xl font-semibold leading-tight">{date.toLocaleDateString("en-US", { day: "numeric", timeZone })}</span>
    </span>
  );
}

/** Home page "Next events": up to three published upcoming events with a link to all events. */
export async function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const events = await loadUpcomingEvents(limit);

  return (
    <section aria-labelledby="home-events" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="home-events" className="text-xl font-semibold tracking-tight md:text-2xl">
            Next events
          </h2>
          <p className="text-base text-muted-foreground">Come and join us. Everyone is welcome.</p>
        </div>
        {events?.length ? (
          <Button asChild variant="ghost" size="lg" className="px-3">
            <Link href={EVENTS_HREF}>
              See all events
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      {events?.length ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => {
            const timeZone = event.timezone || DEFAULT_TIMEZONE;
            const when = formatDateTime(event.startsAt, { timeZone });
            return (
              <li key={event.id} className="min-w-0">
                <Link
                  href={`/c/ghmo/events/${encodeURIComponent(event.id)}` as Route}
                  className="group flex h-full gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/40 md:p-5"
                >
                  <DateBadge value={event.startsAt} timeZone={timeZone} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="text-base font-semibold group-hover:underline">{event.title}</h3>
                    <p className="text-sm text-muted-foreground">{when || "Date to be announced"}</p>
                    {event.location ? (
                      <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{event.location}</span>
                      </p>
                    ) : null}
                    {event.summary ? <p className="line-clamp-2 pt-1 text-sm">{event.summary}</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" />}
          title={events ? "No upcoming events yet — check back soon" : "Events couldn't be loaded right now"}
          description={events ? "New events are posted here as soon as they're planned." : "Please try again in a little while."}
          action={
            <Button asChild variant="outline" size="lg">
              <Link href={EVENTS_HREF}>See all events</Link>
            </Button>
          }
        />
      )}
    </section>
  );
}
