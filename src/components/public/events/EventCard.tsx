import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Clock, FileText, History, MapPin, Star } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import type { EventCardRecord } from "@/src/lib/events";
import { cn } from "@/src/lib/utils";
import { dateTile, eventStart, eventTimeZone, eventWhenParts } from "./eventDates";

export function eventHref(orgSlug: string, id: string) {
  return `/c/${orgSlug}/events/${id}` as Route;
}

export function eventsHref(orgSlug: string) {
  return `/c/${orgSlug}/events` as Route;
}

export function eventFlyerHref(orgSlug: string, id: string) {
  return `/api/organizations/${orgSlug}/events/${id}/announcement.pdf`;
}

type EventCardProps = {
  evt: EventCardRecord;
  orgSlug: string;
  /** Shorter summary (grid view, home page). */
  compact?: boolean;
  /** Show the "Download flyer (PDF)" link (off on the home page). */
  flyer?: boolean;
  /** h2 on the events page, h3 when the cards sit under a section title. */
  headingLevel?: "h2" | "h3";
  /** The event is over: a "Past" badge and a muted date tile, so it reads differently from upcoming ones. */
  past?: boolean;
};

/**
 * One event. The whole card opens the event (the title link stretches over it); the flyer is a
 * secondary link that sits above that layer.
 */
export function EventCard({ evt, orgSlug, compact = false, flyer = true, headingLevel = "h2", past = false }: EventCardProps) {
  const start = eventStart(evt);
  const tile = start ? dateTile(start, eventTimeZone(evt)) : null;
  const when = eventWhenParts(evt);
  const Heading = headingLevel;

  return (
    <article className={cn("relative flex h-full min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/50 hover:bg-muted/30 md:p-6", evt.featured && !past ? "border-primary/40" : "border-border")}>
      <div className="flex min-w-0 gap-4">
        <div
          aria-hidden="true"
          className={cn(
            "flex size-14 shrink-0 flex-col items-center justify-center rounded-md",
            past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}
        >
          <span className="text-sm font-medium leading-none">{tile?.month ?? "Date"}</span>
          <span className="text-xl font-semibold leading-tight">{tile?.day ?? "TBA"}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {past ? (
            <Badge variant="secondary" className="mb-1">
              <History aria-hidden="true" />
              Past
            </Badge>
          ) : evt.featured ? (
            <Badge className="mb-1">
              <Star aria-hidden="true" />
              Featured
            </Badge>
          ) : null}
          <Heading className="text-base font-semibold text-foreground md:text-lg">
            <Link href={eventHref(orgSlug, evt.id)} className="break-words after:absolute after:inset-0 after:rounded-xl">
              {evt.title}
            </Link>
          </Heading>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {/* Date and time wrap as two pieces with a gap, no separator that could start the second line (R4 L7). */}
            {when ? (
              <span className="flex min-w-0 flex-wrap gap-x-3">
                <span>{when.date}</span>{" "}
                <span className="whitespace-nowrap">{when.time}</span>
              </span>
            ) : (
              <span className="min-w-0">Date to be announced</span>
            )}
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
      <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2">
        <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          View details
          <ArrowRight className="size-4" />
        </span>
        {flyer ? (
          <Button asChild variant="outline" className="relative z-10 h-11 md:h-10">
            <a href={eventFlyerHref(orgSlug, evt.id)}>
              <FileText aria-hidden="true" />
              Download flyer (PDF)
              <span className="sr-only"> for {evt.title}</span>
            </a>
          </Button>
        ) : null}
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
