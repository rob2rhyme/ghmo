"use client";

import { CalendarCheck, CalendarPlus, FileText } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import type { EventRecord } from "@/src/lib/events.shared";
import { eventFlyerHref } from "./EventCard";
import { eventIsOver } from "./eventDates";
import { useNow } from "./useNow";

type EventTimeProps = {
  event: Pick<EventRecord, "id" | "startsAt" | "endsAt">;
  /** When the server built this cached copy (see useNow). */
  renderedAt: number;
};

/** "This event has passed", once it has (decided with the browser's clock, since the page is cached). */
export function EventPassedNote({ event, renderedAt }: EventTimeProps) {
  const now = useNow(renderedAt);
  if (!eventIsOver(event, now)) return null;
  return (
    <p className="flex items-center gap-2 text-base text-muted-foreground">
      <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
      This event has passed.
    </p>
  );
}

/** "Add to calendar" while the event is still ahead; the flyer stays for everyone. */
export function EventActions({ event, renderedAt, orgSlug }: EventTimeProps & { orgSlug: string }) {
  const now = useNow(renderedAt);
  const over = eventIsOver(event, now);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {over ? null : (
        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={`/api/calendar/${event.id}`}>
            <CalendarPlus aria-hidden="true" />
            Add to calendar
          </a>
        </Button>
      )}
      <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
        <a href={eventFlyerHref(orgSlug, event.id)}>
          <FileText aria-hidden="true" />
          Download flyer (PDF)
        </a>
      </Button>
    </div>
  );
}
