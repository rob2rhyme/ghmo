import { Skeleton } from "@/src/components/ui/skeleton";

/** Shaped like an event page: back link, title, the when-and-where card, then the text and buttons. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-3xl flex-col gap-6">
      <span className="sr-only">Loading the event…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-9 w-3/4" />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-11 w-full sm:w-44" />
        <Skeleton className="h-11 w-full sm:w-52" />
      </div>
    </div>
  );
}
