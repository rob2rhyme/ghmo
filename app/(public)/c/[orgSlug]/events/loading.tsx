import { EventCardSkeleton } from "@/src/components/public/events/EventCard";
import { Skeleton } from "@/src/components/ui/skeleton";

/** Shaped like the events list: title, the Show and View switches, then a column of cards. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full flex-col gap-6">
      <span className="sr-only">Loading events…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-6 w-full max-w-xl" />
        <Skeleton className="h-11 w-full sm:w-80" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-x-8">
        <Skeleton className="h-11 w-64 max-w-full sm:h-10" />
        <Skeleton className="h-11 w-64 max-w-full sm:h-10" />
      </div>
      <ul className="flex max-w-3xl flex-col gap-4" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <EventCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
