import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Clock, FileText, MapPin } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { EventRecord } from "@/src/lib/events.shared";
import { cn } from "@/src/lib/utils";
import { dateTile, eventStart, eventTimeZone, eventWhenShort } from "./eventDates";

export function eventHref(orgSlug: string, id: string) {
  return `/c/${orgSlug}/events/${id}` as Route;
}

export function eventsHref(orgSlug: string) {
  return `/c/${orgSlug}/events` as Route;
}

export function eventFlyerHref(orgSlug: string, id: string) {
  return `/api/organizations/${orgSlug}/events/${id}/announcement.pdf`;
}

/**
 * One event. The whole card opens the event (the title link stretches over it); the flyer is a
 * secondary link that sits above that layer.
 */
export function EventCard({ evt, orgSlug, compact = false }: { evt: EventRecord; orgSlug: string; compact?: boolean }) {
  const start = eventStart(evt);
  const tile = start ? dateTile(start, eventTimeZone(evt)) : null;

  return (
    <article className="relative flex h-full min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/50 hover:bg-muted/30 md:p-6">
      <div className="flex min-w-0 gap-4">
        <div aria-hidden="true" className="flex size-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="text-sm font-medium leading-none">{tile?.month ?? "Date"}</span>
          <span className="text-xl font-semibold leading-tight">{tile?.day ?? "TBA"}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground md:text-lg">
            <Link href={eventHref(orgSlug, evt.id)} className="break-words after:absolute after:inset-0 after:rounded-xl">
              {evt.title}
            </Link>
          </h2>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{eventWhenShort(evt)}</span>
          </p>
          {evt.location ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{evt.location}</span>
            </p>
          ) : null}
        </div>
      </div>
      {evt.summary ? <p className={cn("text-base text-foreground/90", compact && "line-clamp-3")}>{evt.summary}</p> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          View details
          <ArrowRight className="size-4" />
        </span>
        <Button asChild variant="outline" className="relative z-10 h-11 md:h-10">
          <a href={eventFlyerHref(orgSlug, evt.id)}>
            <FileText aria-hidden="true" />
            Flyer (PDF)
          </a>
        </Button>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex gap-4">
        <Skeleton className="size-14 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-32 self-end" />
    </div>
  );
}
