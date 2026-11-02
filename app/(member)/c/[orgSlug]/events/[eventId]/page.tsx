"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarDays, CalendarPlus, CalendarX, Clock, FileText, MapPin } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { eventFlyerHref, eventsHref as eventsListHref } from "@/src/components/public/events/EventCard";
import { eventStart, eventWhenLong } from "@/src/components/public/events/eventDates";
import type { EventRecord } from "@/src/lib/events.shared";
import { formatDateTime, formatShortDate } from "@/src/lib/format";
import { MeetingAttendance, MeetingMinutesRecord, MinutesStatus, minutesStatusLabels } from "@/src/lib/minutes";
import { resolveActorLabel } from "@/src/lib/actor";

const adminStatusDescriptions: Record<MinutesStatus, string> = {
  draft: "Draft minutes are visible to admins only.",
  submitted: "Submitted minutes await approval before publication.",
  approved: "Approved minutes are the official record."
};

const statusBadgeVariant: Record<MinutesStatus, "secondary" | "warning" | "success"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success"
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

  const backLink = (
    <Button asChild variant="ghost" className="-ml-3 h-11 self-start px-3">
      <Link href={eventsHref}>
        <ArrowLeft aria-hidden="true" />
        All events
      </Link>
    </Button>
  );

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <span className="sr-only">Loading event…</span>
        <Skeleton className="h-11 w-32" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-1/3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-40" />
          <Skeleton className="h-11 w-40" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (loadState === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {backLink}
        <div role="alert">
          <EmptyState
            icon={<AlertTriangle className="text-warning" />}
            title="We couldn't load this event"
            description="Check your internet connection and try again."
            action={
              <Button size="lg" onClick={() => setAttempt(n => n + 1)}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <EmptyState
          icon={<CalendarX />}
          title="This event isn't available"
          description="It may have been removed, or it hasn't been announced yet."
          action={
            <Button asChild size="lg">
              <Link href={eventsHref}>See all events</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const start = eventStart(event);
  const when = eventWhenLong(event);
  const isPastEvent = start ? start.getTime() < loadedAt : false;
  const isAdminMinutesView = adminMinutesAccess && minutesSource === "admin";
  const normalizedMeetingAttendance = meetingMinutes ? normalizeEventAttendance(meetingMinutes.attendance) : undefined;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {backLink}

      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight break-words text-foreground md:text-3xl">{event.title}</h1>
        <div className="flex flex-col gap-2 text-base text-muted-foreground">
          {when ? (
            <>
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{when.date}</span>
              </p>
              <p className="flex items-start gap-2">
                <Clock className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{when.time}</span>
              </p>
            </>
          ) : (
            <p className="flex items-start gap-2">
              <CalendarDays className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>Date to be announced</span>
            </p>
          )}
          {event.location ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{event.location}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <a href={`/api/calendar/${event.id}`}>
              <CalendarPlus aria-hidden="true" />
              Add to calendar
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={eventFlyerHref(orgSlug, event.id)}>
              <FileText aria-hidden="true" />
              Download flyer (PDF)
            </a>
          </Button>
        </div>
      </header>

      {event.summary ? <p className="text-lg text-foreground/90">{event.summary}</p> : null}

      {event.body?.trim() ? (
        <Card>
          <p className="whitespace-pre-wrap break-words text-base text-foreground">{event.body}</p>
        </Card>
      ) : null}

      {isPastEvent ? (
        <Card aria-labelledby="event-minutes-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="event-minutes-title" className="text-lg font-semibold text-foreground">
              Meeting minutes
            </h2>
            {!meetingMinutes && !minutesLoading && adminMinutesAccess ? (
              <Button asChild variant="outline">
                <Link href={`/admin/minutes?mode=new&eventId=${event.id}`}>Add minutes</Link>
              </Button>
            ) : null}
          </div>
          {minutesLoading ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <span className="sr-only">Loading minutes…</span>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : meetingMinutes ? (
            <div className="flex flex-col gap-4 text-sm text-foreground/90">
              <div className="flex flex-col gap-2">
                <Badge variant={statusBadgeVariant[meetingMinutes.status]}>{minutesStatusLabels[meetingMinutes.status]}</Badge>
                {isAdminMinutesView ? (
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>{adminStatusDescriptions[meetingMinutes.status]}</p>
                    {meetingMinutes.encrypted && meetingMinutes.status !== "approved" ? (
                      <p>The content of unapproved minutes is encrypted. Open Meeting Minutes to read it.</p>
                    ) : null}
                    {meetingMinutes.submittedAt ? (
                      <p>
                        Submitted by {resolveActorLabel({ roles: ["admin"] })} · {formatTimestamp(meetingMinutes.submittedAt)}
                      </p>
                    ) : null}
                    {meetingMinutes.approvedAt ? (
                      <p>
                        Approved by {resolveActorLabel({ roles: ["admin"] })} · {formatTimestamp(meetingMinutes.approvedAt)}
                      </p>
                    ) : null}
                  </div>
                ) : meetingMinutes.status === "approved" ? (
                  <p className="text-sm text-muted-foreground">Official minutes for this event.</p>
                ) : null}
              </div>
              {meetingMinutes.agenda.length ? (
                <MinutesList title="Agenda" items={meetingMinutes.agenda} />
              ) : null}
              {meetingMinutes.discussionSummary ? (
                <section className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground">Discussion summary</h3>
                  <p className="whitespace-pre-line text-sm text-foreground/90">{meetingMinutes.discussionSummary}</p>
                </section>
              ) : null}
              {meetingMinutes.decisions.length ? <MinutesList title="Decisions" items={meetingMinutes.decisions} /> : null}
              {meetingMinutes.actionItems.length ? (
                <MinutesList
                  title="Action items"
                  items={meetingMinutes.actionItems.map(
                    action =>
                      `${action.task}${action.assignedTo ? ` — ${action.assignedTo}` : ""}${action.dueDate ? ` (due ${formatShortDate(action.dueDate)})` : ""}`
                  )}
                />
              ) : null}
              {renderAttendanceBlock(normalizedMeetingAttendance)}
              {meetingMinutes.signatures && (meetingMinutes.signatures.chairName || meetingMinutes.signatures.secretaryName) ? (
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {meetingMinutes.signatures.chairName ? (
                    <p>
                      <span className="font-semibold text-foreground">Chair:</span> {meetingMinutes.signatures.chairName}
                    </p>
                  ) : null}
                  {meetingMinutes.signatures.secretaryName ? (
                    <p>
                      <span className="font-semibold text-foreground">Secretary:</span> {meetingMinutes.signatures.secretaryName}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {meetingMinutes.approvalNotes ? (
                <p className="text-sm text-muted-foreground">Approval notes: {meetingMinutes.approvalNotes}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Recorded by {resolveActorLabel(meetingMinutes.recordedBy)} · {formatTimestamp(meetingMinutes.createdAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No minutes recorded for this event yet.</p>
          )}
        </Card>
      ) : null}
    </article>
  );
}

function MinutesList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function formatTimestamp(value?: number) {
  return formatDateTime(value) || "Date unavailable";
}

function normalizeEventAttendance(value?: MeetingMinutesRecord["attendance"] | string[]): MeetingAttendance | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const present = value.map(item => item.trim()).filter(Boolean);
    return present.length ? { present } : undefined;
  }
  const present = (value.present || []).map(item => item.trim()).filter(Boolean);
  const absent = (value.absent || []).map(item => item.trim()).filter(Boolean);
  const guests = (value.guests || []).map(item => item.trim()).filter(Boolean);
  if (!present.length && !absent.length && !guests.length) return undefined;
  const result: MeetingAttendance = { present };
  if (absent.length) result.absent = absent;
  if (guests.length) result.guests = guests;
  return result;
}

function renderAttendanceBlock(attendance?: MeetingAttendance) {
  if (!attendance) return null;
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      {attendance.present && attendance.present.length ? (
        <p>
          <span className="font-semibold text-foreground">Present:</span> {attendance.present.join(", ")}
        </p>
      ) : null}
      {attendance.absent && attendance.absent.length ? (
        <p>
          <span className="font-semibold text-foreground">Absent:</span> {attendance.absent.join(", ")}
        </p>
      ) : null}
      {attendance.guests && attendance.guests.length ? (
        <p>
          <span className="font-semibold text-foreground">Guests:</span> {attendance.guests.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
