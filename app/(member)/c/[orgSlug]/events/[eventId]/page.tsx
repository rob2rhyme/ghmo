import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import type { Route } from "next";
import { AlertTriangle, CalendarDays, CalendarPlus, CalendarX, Clock, FileText, MapPin } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { RefreshButton } from "@/src/components/states/RefreshButton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { eventFlyerHref, eventsHref as eventsListHref } from "@/src/components/public/events/EventCard";
import { eventStart, eventWhenLong } from "@/src/components/public/events/eventDates";
import { requireActiveAdmin } from "@/src/lib/admin";
import { listAdminMinutes } from "@/src/lib/adminData.server";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import type { MeetingMinutesRecord, MinutesStatus } from "@/src/lib/minutes";
import { getApprovedMinutesForEvent, getPublishedEvent } from "@/src/lib/publicData.server";
import { statusBadge } from "@/src/lib/statusBadges";

export const dynamic = "force-dynamic";

// Shown to admins beside the status badge; visitors only ever see approved minutes.
const adminStatusDescriptions: Record<MinutesStatus, string> = {
  draft: "Draft minutes are visible to admins only.",
  submitted: "Submitted minutes wait for approval before they are published.",
  approved: "Approved minutes are the official record and are in the public archive."
};

/** True for a signed-in admin (the same check the admin minutes API makes); visitors without a session cost nothing. */
async function isAdminViewer(): Promise<boolean> {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    return true;
  } catch (error) {
    unstable_rethrow(error);
    return false;
  }
}

/** Admins see the event's minutes in any status; everyone else only approved minutes. */
async function loadMinutes(eventId: string, admin: boolean): Promise<MeetingMinutesRecord | null> {
  if (!admin) return getApprovedMinutesForEvent(eventId);
  try {
    return ((await listAdminMinutes({ eventId }))[0] as MeetingMinutesRecord | undefined) ?? null;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const eventsHref = eventsListHref(orgSlug);
  const event = orgSlug === COMMUNITY_SLUG ? await getPublishedEvent(eventId) : null;

  if (event === undefined) {
    return (
      <MessagePage
        icon={<AlertTriangle />}
        title="We couldn't load this event"
        description="The event can't be read right now. Try again in a moment."
        actions={
          <>
            <RefreshButton />
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
  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request; "now" is that request's time
  const isPastEvent = start ? start.getTime() < Date.now() : false;
  const admin = isPastEvent ? await isAdminViewer() : false;
  const meetingMinutes = isPastEvent ? await loadMinutes(event.id, admin) : null;
  const minutesBadge = meetingMinutes ? statusBadge("minutes", meetingMinutes.status) : null;

  return (
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader back={{ href: eventsHref, label: "All events" }} title={<span className="break-words">{event.title}</span>} />

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
            {admin && minutesBadge ? <Badge variant={minutesBadge.variant}>{minutesBadge.label}</Badge> : null}
          </div>
          {meetingMinutes ? (
            <>
              <p className="text-sm text-muted-foreground">
                {admin ? adminStatusDescriptions[meetingMinutes.status] : "The board's approved minutes of this meeting are in the public archive."}
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
                {admin && meetingMinutes.id ? (
                  <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                    <Link href={`/admin/minutes?minutesId=${encodeURIComponent(meetingMinutes.id)}` as Route}>Open meeting minutes</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No minutes recorded for this event yet.</p>
              {admin ? (
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
