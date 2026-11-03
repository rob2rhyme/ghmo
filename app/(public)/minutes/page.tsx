import Link from "next/link";
import type { Metadata, Route } from "next";
import { ChevronRight, FileText } from "lucide-react";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { Button } from "@/src/components/ui/button";
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
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader title="Meeting minutes" description="Approved minutes from our board and general meetings." />
      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No minutes have been published yet"
          description="Minutes are added here after the board approves them. Meanwhile, see what's coming up."
          action={
            <Button asChild variant="outline" size="lg">
              <Link href={"/c/ghmo/events" as Route}>See upcoming events</Link>
            </Button>
          }
        />
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <section key={year} aria-labelledby={`year-${year}`} className="flex flex-col gap-3">
            <PublicSectionTitle id={`year-${year}`}>{year}</PublicSectionTitle>
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
    </PublicPage>
  );
}
