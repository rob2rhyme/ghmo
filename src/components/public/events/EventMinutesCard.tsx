"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { FileText } from "lucide-react";
import { useAuthSession } from "@/src/hooks/useAuthSession";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import type { EventRecord } from "@/src/lib/events.shared";
import type { MinutesStatus } from "@/src/lib/minutes";
import { statusBadge } from "@/src/lib/statusBadges";
import { eventIsOver } from "./eventDates";
import { useNow } from "./useNow";

// Shown to admins beside the status badge; visitors only ever see approved minutes.
const adminStatusDescriptions: Record<MinutesStatus, string> = {
  draft: "Draft minutes are visible to admins only.",
  submitted: "Submitted minutes wait for approval before they are published.",
  approved: "Approved minutes are the official record and are in the public archive."
};

type AdminMinutes = { id: string; status: MinutesStatus };

/** What an admin's browser learned from the admin minutes API: the event's minutes (or none), or that the read failed. */
type AdminView = { state: "loaded"; minutes: AdminMinutes | null } | { state: "failed" };

function isMinutesStatus(value: unknown): value is MinutesStatus {
  return value === "draft" || value === "submitted" || value === "approved";
}

/**
 * For a signed-in admin, the event's minutes in any status. Visitors (and admins whose session has
 * lapsed: 401/403) get null and see only the server-rendered public card.
 */
function useAdminMinutes(eventId: string): AdminView | null {
  const { session } = useAuthSession();
  const isAdmin = Boolean(session?.isAdmin);
  const [view, setView] = useState<{ eventId: string; view: AdminView } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    fetch(`/api/admin/minutes?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async res => {
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) return { state: "failed" } as const;
        const data = (await res.json().catch(() => null)) as { minutes?: Array<{ id?: unknown; status?: unknown }> } | null;
        if (!data || !Array.isArray(data.minutes)) return { state: "failed" } as const;
        const first = data.minutes[0];
        const minutes = first && typeof first.id === "string" && isMinutesStatus(first.status) ? { id: first.id, status: first.status } : null;
        return { state: "loaded", minutes } as const;
      })
      .catch(error => ((error as { name?: string })?.name === "AbortError" ? null : ({ state: "failed" } as const)))
      .then(result => {
        if (!controller.signal.aborted && result) setView({ eventId, view: result });
      });
    return () => controller.abort();
  }, [eventId, isAdmin]);

  return isAdmin && view?.eventId === eventId ? view.view : null;
}

type EventMinutesCardProps = {
  event: Pick<EventRecord, "id" | "startsAt" | "endsAt">;
  /** The approved minutes' id, read on the server; null when there are none. */
  approvedMinutesId: string | null;
  /** When the server built this cached copy (see useNow). */
  renderedAt: number;
};

/**
 * The event's meeting minutes. Visitors see a card only when approved minutes exist (rendered on the
 * server). An admin's browser adds the minutes' status and the admin links, and offers "Add minutes"
 * once the event is over.
 */
export function EventMinutesCard({ event, approvedMinutesId, renderedAt }: EventMinutesCardProps) {
  const admin = useAdminMinutes(event.id);
  const now = useNow(renderedAt);
  const over = eventIsOver(event, now);

  if (admin?.state === "failed") {
    return (
      <MinutesFrame>
        <p className="text-sm text-muted-foreground">We couldn&apos;t load the minutes for this event right now. Try again in a moment.</p>
        <div className="flex flex-wrap gap-2">
          {approvedMinutesId ? <ReadMinutesButton id={approvedMinutesId} /> : null}
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href={"/admin/minutes" as Route}>Open meeting minutes</Link>
          </Button>
        </div>
      </MinutesFrame>
    );
  }

  if (admin?.state === "loaded") {
    const minutes = admin.minutes;
    if (!minutes && !over) return null;
    const badge = minutes ? statusBadge("minutes", minutes.status) : null;
    return (
      <MinutesFrame badge={badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}>
        {minutes ? (
          <>
            <p className="text-sm text-muted-foreground">{adminStatusDescriptions[minutes.status]}</p>
            <div className="flex flex-wrap gap-2">
              {minutes.status === "approved" ? <ReadMinutesButton id={minutes.id} /> : null}
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link href={`/admin/minutes?minutesId=${encodeURIComponent(minutes.id)}` as Route}>Open meeting minutes</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No minutes recorded for this event yet.</p>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto sm:self-start">
              <Link href={`/admin/minutes?mode=new&eventId=${encodeURIComponent(event.id)}` as Route}>Add minutes</Link>
            </Button>
          </>
        )}
      </MinutesFrame>
    );
  }

  // Visitors, and admins while the check runs: the public card, only when approved minutes exist.
  if (!approvedMinutesId) return null;
  return (
    <MinutesFrame>
      <p className="text-sm text-muted-foreground">The board&apos;s approved minutes of this meeting are in the public archive.</p>
      <div className="flex flex-wrap gap-2">
        <ReadMinutesButton id={approvedMinutesId} />
      </div>
    </MinutesFrame>
  );
}

function MinutesFrame({ badge, children }: { badge?: ReactNode; children: ReactNode }) {
  return (
    <Card aria-labelledby="event-minutes-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="event-minutes-title" className="text-base font-semibold text-foreground">
          Meeting minutes
        </h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

function ReadMinutesButton({ id }: { id: string }) {
  return (
    <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
      <Link href={`/minutes/${encodeURIComponent(id)}` as Route}>
        <FileText aria-hidden="true" />
        Read the minutes
      </Link>
    </Button>
  );
}
