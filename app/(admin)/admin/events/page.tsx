//app/(admin)/admin/events/page.tsx
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Plus } from "lucide-react";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { formatDateTime, toDate, type DateInput } from "@/src/lib/format";
import { statusBadge } from "@/src/lib/statusBadges";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEventsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect("/admin/login");
    }
    redirect("/admin/login");
  }

  const res = await internalFetch(
    `/api/organizations/${COMMUNITY_SLUG}/admin/events`
  );
  if (!res.ok) throw new Error("Failed to load events");
  const { events } = (await res.json()) as {
    events: {
      id: string;
      title?: string;
      summary?: string;
      startsAt?: DateInput;
      timezone?: string;
      status?: string;
      featured?: boolean;
      announcementDocTemplate?: string | null;
    }[];
  };

  type AdminEvent = (typeof events)[number];
  const { upcoming, past } = splitByTime(events);

  const row = (evt: AdminEvent) => {
    const status = statusBadge("event", evt.status);
    const when = eventDate(evt.startsAt, evt.timezone);
    return (
      <AdminListRow
        key={evt.id}
        href={`/admin/events/${evt.id}/edit` as Route}
        title={<span className="break-words">{evt.title || "Untitled event"}</span>}
        badges={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            {evt.featured ? <Badge variant="outline">Featured</Badge> : null}
          </>
        }
        meta={
          <>
            <span>{when || "No date set"}</span>
            {evt.summary ? <span className="mt-0.5 line-clamp-2 block">{evt.summary}</span> : null}
          </>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Events"
        description="Meetings and community gatherings. Published events show on the public Events page."
        actions={
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus aria-hidden="true" />
              New event
            </Link>
          </Button>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" />}
          title="No events yet"
          description="Add your first meeting or gathering. It stays a draft until you publish it."
          action={
            <Button asChild>
              <Link href="/admin/events/new">
                <Plus aria-hidden="true" />
                New event
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <AdminSectionCard title="Upcoming" description="Soonest first. Select an event to edit it.">
            {upcoming.length ? (
              <AdminList bare label="Upcoming events">
                {upcoming.map(row)}
              </AdminList>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing coming up. Add the next meeting or gathering with New event.</p>
            )}
          </AdminSectionCard>
          {past.length ? (
            <AdminSectionCard title="Past" description="Most recent first.">
              <AdminList bare label="Past events">
                {past.map(row)}
              </AdminList>
            </AdminSectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Upcoming soonest first (events without a date count as upcoming, at the end), then past, latest first. */
function splitByTime<T extends { startsAt?: DateInput }>(events: T[]): { upcoming: T[]; past: T[] } {
  const now = Date.now();
  const startMs = (evt: T) => toDate(evt.startsAt)?.getTime() ?? Infinity;
  const byStart = (a: T, b: T) => (startMs(a) === startMs(b) ? 0 : startMs(a) - startMs(b));
  return {
    upcoming: events.filter(evt => startMs(evt) >= now).sort(byStart),
    past: events.filter(evt => startMs(evt) < now).sort((a, b) => byStart(b, a))
  };
}

/** "Sat, Dec 12, 2026 · 7:00 PM" in the event's own time zone (falls back to the server's if it is unknown). */
function eventDate(value: DateInput, timeZone?: string): string {
  try {
    return formatDateTime(value, { timeZone });
  } catch {
    return formatDateTime(value);
  }
}
