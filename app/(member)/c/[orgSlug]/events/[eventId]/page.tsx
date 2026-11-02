"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Route } from "next";
import { AlertTriangle, CalendarDays, CalendarPlus, CalendarX, Clock, FileText, MapPin } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { eventFlyerHref, eventsHref as eventsListHref } from "@/src/components/public/events/EventCard";
import { eventStart, eventWhenLong } from "@/src/components/public/events/eventDates";
import type { EventRecord } from "@/src/lib/events.shared";
import type { MeetingMinutesRecord, MinutesStatus } from "@/src/lib/minutes";
import { statusBadge } from "@/src/lib/statusBadges";

// Shown to admins beside the status badge; visitors only ever see approved minutes.
const adminStatusDescriptions: Record<MinutesStatus, string> = {
  draft: "Draft minutes are visible to admins only.",
  submitted: "Submitted minutes wait for approval before they are published.",
  approved: "Approved minutes are the official record and are in the public archive."
};

export default function EventDetailPage() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || "ghmo";
  const eventId = params?.eventId as string;
  const eventsHref = eventsListHref(orgSlug);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<"ok" | "unavailable" | "failed">("ok");
  const [attempt, setAttempt] = useState(0);
  // "Now" for deciding whether the event is past, taken when it loads (keeps rendering pure).
  const [loadedAt, setLoadedAt] = useState(0);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinutesRecord | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(true);
  const [adminMinutesAccess, setAdminMinutesAccess] = useState(false);
  const [minutesSource, setMinutesSource] = useState<"public" | "admin">("public");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadState("ok");
      try {
        const res = await fetch(`/api/organizations/${orgSlug}/events`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(`Events request failed (${res.status})`);
        const found = (data.events || []).find((e: EventRecord) => e.id === eventId) as EventRecord | undefined;
        if (!found || found.status !== "published") {
          setEvent(null);
          setLoadState("unavailable");
          return;
        }
        setEvent(found);
        setLoadedAt(Date.now());
      } catch (err) {
        console.error(err);
        setLoadState("failed");
      } finally {
        setLoading(false);
      }
    };
    if (eventId) void load();
  }, [eventId, orgSlug, attempt]);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    const loadMinutes = async () => {
      setMinutesLoading(true);
      try {
        const endpoint = adminMinutesAccess
          ? `/api/admin/minutes?eventId=${eventId}`
          : `/api/organizations/${orgSlug}/events/${eventId}/minutes`;
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setMeetingMinutes(null);
          setMinutesSource(adminMinutesAccess ? "admin" : "public");
          return;
        }
        let record: MeetingMinutesRecord | null = null;
        if (Array.isArray(data.minutes)) {
          record = data.minutes[0] ?? null;
        } else if (data.minutes) {
          record = data.minutes;
        }
        setMinutesSource(adminMinutesAccess ? "admin" : "public");
        setMeetingMinutes(record);
      } catch {
        if (active) {
          setMeetingMinutes(null);
        }
      } finally {
        if (active) setMinutesLoading(false);
      }
    };
    void loadMinutes();
    return () => {
      active = false;
    };
  }, [eventId, orgSlug, adminMinutesAccess]);

  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/minutes");
        if (!active) return;
        setAdminMinutesAccess(res.ok);
      } catch {
        if (active) setAdminMinutesAccess(false);
      }
    };
    void checkAdmin();
    return () => {
      active = false;
    };
  }, []);

  const back = { href: eventsHref, label: "All events" };

  if (loading) {
    return (
      <PublicPage width="reading">
        <div role="status" aria-live="polite" className="flex flex-col gap-6">
          <span className="sr-only">Loading event…</span>
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-5 w-full" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-40" />
            <Skeleton className="h-11 w-40" />
          </div>
        </div>
      </PublicPage>
    );
  }

  if (loadState === "failed") {
    return (
      <MessagePage
        icon={<AlertTriangle />}
        title="We couldn't load this event"
        description="Check your internet connection and try again."
        actions={
          <>
            <Button size="lg" onClick={() => setAttempt(n => n + 1)}>
              Try again
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={eventsHref}>See all events</Link>
            </Button>
          </>
        }
      />
    );
  }

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

  const start = eventStart(event);
  const when = eventWhenLong(event);
  const isPastEvent = start ? start.getTime() < loadedAt : false;
  const isAdminMinutesView = adminMinutesAccess && minutesSource === "admin";
  const minutesBadge = meetingMinutes ? statusBadge("minutes", meetingMinutes.status) : null;

  return (
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader back={back} title={<span className="break-words">{event.title}</span>} />

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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={`/api/calendar/${event.id}`}>
            <CalendarPlus aria-hidden="true" />
            Add to calendar
          </a>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <a href={eventFlyerHref(orgSlug, event.id)}>
            <FileText aria-hidden="true" />
            Download flyer (PDF)
          </a>
        </Button>
      </div>

      {isPastEvent ? (
        <Card aria-labelledby="event-minutes-title">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="event-minutes-title" className="text-base font-semibold text-foreground">
              Meeting minutes
            </h2>
            {isAdminMinutesView && minutesBadge ? <Badge variant={minutesBadge.variant}>{minutesBadge.label}</Badge> : null}
          </div>
          {minutesLoading ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">Loading minutes…</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-11 w-40" />
            </div>
          ) : meetingMinutes ? (
            <>
              <p className="text-sm text-muted-foreground">
                {isAdminMinutesView
                  ? adminStatusDescriptions[meetingMinutes.status]
                  : "The board's approved minutes of this meeting are in the public archive."}
              </p>
              <div className="flex flex-wrap gap-2">
                {meetingMinutes.status === "approved" && meetingMinutes.id ? (
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <Link href={`/minutes/${encodeURIComponent(meetingMinutes.id)}` as Route}>
                      <FileText aria-hidden="true" />
                      Read the minutes
                    </Link>
                  </Button>
                ) : null}
                {isAdminMinutesView && meetingMinutes.id ? (
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <Link href={`/admin/minutes?minutesId=${encodeURIComponent(meetingMinutes.id)}` as Route}>Open meeting minutes</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No minutes recorded for this event yet.</p>
              {adminMinutesAccess ? (
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto sm:self-start">
                  <Link href={`/admin/minutes?mode=new&eventId=${encodeURIComponent(event.id)}` as Route}>Add minutes</Link>
                </Button>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </PublicPage>
  );
}
