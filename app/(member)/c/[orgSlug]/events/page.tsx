"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TIMEZONE, type EventRecord } from "@/src/lib/events.shared";
import { useParams } from "next/navigation";
import Link from "next/link";

type ViewMode = "calendar" | "list" | "grid";
type StatusFilter = "future" | "past" | "all";

function groupByDay(events: EventRecord[]) {
  const map: Record<string, EventRecord[]> = {};
  events.forEach(evt => {
    const date = evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt) : new Date();
    const key = date.toISOString().slice(0, 10);
    map[key] = map[key] || [];
    map[key].push(evt);
  });
  return map;
}

export default function EventsPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || "ghmo";
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<StatusFilter>("future");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/organizations/${orgSlug}/events`);
        const data = await res.json();
        setEvents(data.events || []);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [orgSlug]);

  const filtered = useMemo(() => {
    const now = Date.now();
    if (filter === "all") return events;
    if (filter === "future") {
      return events.filter(evt => {
        const ts = evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() : now;
        return ts >= now;
      });
    }
    return events.filter(evt => {
      const ts = evt.startsAt ? new Date(evt.startsAt.toDate?.() || evt.startsAt).getTime() : 0;
      return ts < now;
    });
  }, [events, filter]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Organization events and announcements</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a calendar file download, not a page */}
          <a href="/api/calendar" className="text-sm font-semibold text-primary">
            Subscribe in your calendar app (.ics)
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["calendar", "list", "grid"] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                view === mode ? "bg-primary text-white" : "border border-border bg-card text-foreground"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
          {(["future", "past", "all"] as StatusFilter[]).map(stat => (
            <button
              key={stat}
              onClick={() => setFilter(stat)}
              className={`rounded-md px-3 py-2 text-sm ${
                filter === stat ? "bg-slate-900 text-white" : "border border-border bg-card text-foreground/80"
              }`}
            >
              {stat === "future" ? "Upcoming" : stat === "past" ? "Past" : "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading events...</p>
      ) : view === "calendar" ? (
        <CalendarView grouped={grouped} orgSlug={orgSlug} />
      ) : view === "grid" ? (
        <GridView events={filtered} orgSlug={orgSlug} />
      ) : (
        <ListView events={filtered} orgSlug={orgSlug} />
      )}
    </div>
  );
}

function ListView({ events, orgSlug }: { events: EventRecord[]; orgSlug: string }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <div className="space-y-3">
      {events.map(evt => (
        <div key={evt.id} className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{evt.title}</h2>
              {evt.startsAt ? (
                <p className="text-sm text-muted-foreground">
                  {new Date(evt.startsAt.toDate?.() || evt.startsAt).toLocaleString("en-US", { timeZone: evt.timezone || DEFAULT_TIMEZONE })}
                </p>
              ) : null}
              {evt.location ? <p className="text-sm text-muted-foreground">{evt.location}</p> : null}
            </div>
            <Link
              href={`/api/organizations/${orgSlug}/events/${evt.id}/announcement.pdf`}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Download Announcement PDF
            </Link>
          </div>
          {evt.summary ? <p className="mt-2 text-sm text-foreground/80">{evt.summary}</p> : null}
          <div className="mt-2 flex gap-3 text-sm text-primary">
            <Link href={`/c/${orgSlug}/events/${evt.id}`} className="font-semibold hover:underline">
              View details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function GridView({ events, orgSlug }: { events: EventRecord[]; orgSlug: string }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {events.map(evt => (
        <div key={evt.id} className="rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{evt.title}</h3>
              {evt.startsAt ? (
                <p className="text-sm text-muted-foreground">
                  {new Date(evt.startsAt.toDate?.() || evt.startsAt).toLocaleString("en-US", { timeZone: evt.timezone || DEFAULT_TIMEZONE })}
                </p>
              ) : null}
              {evt.location ? <p className="text-sm text-muted-foreground">{evt.location}</p> : null}
            </div>
          </div>
          {evt.summary ? <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{evt.summary}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/api/organizations/${orgSlug}/events/${evt.id}/announcement.pdf`}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"
            >
              Download PDF
            </Link>
            <Link
              href={`/c/${orgSlug}/events/${evt.id}`}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/50"
            >
              Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarView({ grouped, orgSlug }: { grouped: Record<string, EventRecord[]>; orgSlug: string }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array(startWeekday).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (days.length % 7 !== 0) days.push(null);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 text-lg font-semibold">
        {today.toLocaleString("default", { month: "long" })} {year}
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="pb-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, idx) => {
          const dateStr = day ? new Date(year, month, day).toISOString().slice(0, 10) : "";
          const dayEvents = day ? grouped[dateStr] || [] : [];
          return (
            <div key={idx} className="min-h-[90px] rounded-md border border-border bg-background p-2 text-xs">
              <div className="font-semibold text-foreground/80">{day || ""}</div>
              <div className="mt-1 space-y-1">
                {dayEvents.map(evt => (
                  <Link key={evt.id} href={`/c/${orgSlug}/events/${evt.id}`} className="block rounded-sm bg-card px-1 py-0.5 text-[11px] font-semibold text-primary">
                    {evt.title}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
