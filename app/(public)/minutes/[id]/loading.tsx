import { Skeleton } from "@/src/components/ui/skeleton";

/**
 * Each record's page is built on its first visit (generateStaticParams returns none), so that first visit shows
 * this while it renders. Shaped like the record: back link, title, meeting line, then a few sections. Replaces the
 * public area's shared loading.tsx, which made every cached page stream its content after the footer (R4 P4).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-3xl flex-col gap-6">
      <span className="sr-only">Loading the minutes…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
        </div>
      ))}
    </div>
  );
}
