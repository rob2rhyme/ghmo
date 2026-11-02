import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { formatDate, formatShortDate } from "@/src/lib/format";
import { getArchiveEntry } from "@/src/lib/minutesArchive.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const entry = await getArchiveEntry((await params).id);
  return { title: entry ? `${entry.eventTitle} minutes · GHMO` : "Minutes not found" };
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <ul className="list-disc space-y-1 pl-6 text-base text-foreground/90">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function MinutesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const entry = await getArchiveEntry((await params).id);
  if (!entry) notFound();
  const date = entry.eventDate ? formatDate(entry.eventDate) : null;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 h-11 self-start px-3">
        <Link href="/minutes">
          <ArrowLeft aria-hidden="true" />
          All minutes
        </Link>
      </Button>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words text-foreground md:text-3xl">{entry.eventTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {entry.meetingType}
          {date ? ` · ${date}` : ""}
        </p>
      </header>
      {entry.discussionSummary ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">Discussion</h2>
          <p className="whitespace-pre-line text-base text-foreground/90">{entry.discussionSummary}</p>
        </section>
      ) : null}
      <List title="Agenda" items={entry.agenda} />
      <List title="Decisions" items={entry.decisions} />
      <List
        title="Action items"
        items={entry.actionItems.map(item => `${item.task}${item.dueDate ? ` (due ${formatShortDate(item.dueDate)})` : ""}`)}
      />
      {entry.attendance || entry.signatures?.chairName || entry.signatures?.secretaryName || entry.approvedAt ? (
        <footer className="flex flex-col gap-1 border-t border-border pt-4">
          {entry.attendance ? (
            <p className="text-sm text-muted-foreground">
              Attendance: {entry.attendance.present} present
              {entry.attendance.absent ? `, ${entry.attendance.absent} absent` : ""}
              {entry.attendance.guests ? `, ${entry.attendance.guests} guest${entry.attendance.guests === 1 ? "" : "s"}` : ""}.
            </p>
          ) : null}
          {entry.signatures?.chairName || entry.signatures?.secretaryName ? (
            <p className="text-sm text-muted-foreground">
              {[entry.signatures.chairName && `Chair: ${entry.signatures.chairName}`, entry.signatures.secretaryName && `Secretary: ${entry.signatures.secretaryName}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {entry.approvedAt ? <p className="text-sm text-muted-foreground">Approved {formatShortDate(entry.approvedAt)}.</p> : null}
        </footer>
      ) : null}
    </article>
  );
}
