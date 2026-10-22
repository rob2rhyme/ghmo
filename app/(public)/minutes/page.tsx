import Link from "next/link";
import type { Metadata } from "next";
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
    <div className="mx-auto max-w-3xl space-y-8 py-6">
      <header>
        <h1 className="text-3xl font-semibold text-foreground">Meeting minutes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Minutes of our board and general meetings, published after approval. Attendance is shown as numbers only.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No minutes have been published yet.</p>
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <section key={year} aria-labelledby={`year-${year}`}>
            <h2 id={`year-${year}`} className="text-lg font-semibold text-foreground">
              {year}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {items.map(entry => (
                <li key={entry.id}>
                  <Link href={`/minutes/${entry.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-muted/50">
                    <span className="font-medium text-foreground">{entry.eventTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.meetingType}
                      {entry.eventDate ? ` · ${new Date(entry.eventDate).toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}
                    </span>
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
