import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, FileText } from "lucide-react";
import { EmptyState } from "@/src/components/ui/empty-state";
import { formatShortDate } from "@/src/lib/format";
import { listArchive } from "@/src/lib/minutesArchive.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Meeting minutes · GHMO",
  description: "Approved meeting minutes of the Greater Harrisburg Magar Organization."
};

export default async function MinutesArchivePage() {
  const entries = await listArchive();
  const byYear = new Map<string, typeof entries>();
  for (const entry of entries) {
    const year = entry.eventDate ? String(new Date(entry.eventDate).getFullYear()) : "Undated";
    byYear.set(year, [...(byYear.get(year) ?? []), entry]);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Meeting minutes</h1>
        <p className="text-base text-muted-foreground">Approved minutes from our board and general meetings.</p>
      </header>
      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No minutes have been published yet."
          description="Minutes are added here after the board approves them. Please check back after the next meeting."
        />
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <section key={year} aria-labelledby={`year-${year}`} className="flex flex-col gap-3">
            <h2 id={`year-${year}`} className="text-lg font-semibold text-foreground">
              {year}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {items.map(entry => (
                <li key={entry.id}>
                  <Link href={`/minutes/${entry.id}`} className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium break-words text-foreground">{entry.eventTitle}</span>
                      <span className="text-sm text-muted-foreground">
                        {entry.meetingType}
                        {entry.eventDate ? ` · ${formatShortDate(entry.eventDate)}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
