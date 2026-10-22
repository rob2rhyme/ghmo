import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArchiveEntry } from "@/src/lib/minutesArchive.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const entry = await getArchiveEntry((await params).id);
  return { title: entry ? `${entry.eventTitle} minutes · GHMO` : "Minutes not found" };
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-foreground/90">
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
  const date = entry.eventDate ? new Date(entry.eventDate).toLocaleDateString("en-US", { dateStyle: "long" }) : null;

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <Link href="/minutes" className="text-sm font-semibold text-primary">
        ← All minutes
      </Link>
      <header>
        <h1 className="text-3xl font-semibold text-foreground">{entry.eventTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.meetingType}
          {date ? ` · ${date}` : ""}
        </p>
      </header>
      {entry.discussionSummary ? (
        <section>
          <h2 className="text-lg font-semibold text-foreground">Discussion</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">{entry.discussionSummary}</p>
        </section>
      ) : null}
      <List title="Agenda" items={entry.agenda} />
      <List title="Decisions" items={entry.decisions} />
      <List
        title="Action items"
        items={entry.actionItems.map(item => `${item.task}${item.dueDate ? ` (due ${new Date(item.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })})` : ""}`)}
      />
      {entry.attendance ? (
        <p className="text-sm text-muted-foreground">
          Attendance: {entry.attendance.present} present
          {entry.attendance.absent ? `, ${entry.attendance.absent} absent` : ""}
          {entry.attendance.guests ? `, ${entry.attendance.guests} guest${entry.attendance.guests === 1 ? "" : "s"}` : ""}.
        </p>
      ) : null}
      {entry.signatures?.chairName || entry.signatures?.secretaryName ? (
        <p className="text-sm text-muted-foreground">
          {[entry.signatures.chairName && `Chair: ${entry.signatures.chairName}`, entry.signatures.secretaryName && `Secretary: ${entry.signatures.secretaryName}`].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {entry.approvedAt ? <p className="text-xs text-muted-foreground">Approved {new Date(entry.approvedAt).toLocaleDateString("en-US", { dateStyle: "long" })}.</p> : null}
    </article>
  );
}
