import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { DUE_DATE, formatDate, formatShortDate } from "@/src/lib/format";
import { getArchiveEntry } from "@/src/lib/publicData.server";

// Built on first visit and refreshed every 5 minutes, or at once when minutes are approved (publicCache.server.ts).
export const revalidate = 300;

/** No copies at build time: each record's page is built on its first visit, then served from the cache. */
export function generateStaticParams(): { id: string }[] {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const entry = await getArchiveEntry((await params).id);
  // A missing record shows the 404 page, but streaming has already sent "200", so keep search engines out.
  if (!entry) return { title: "Page not found · GHMO", robots: { index: false, follow: true } };
  const date = entry.eventDate ? formatDate(entry.eventDate) : null;
  const kind = entry.meetingType.trim().toLowerCase();
  const meeting = !kind || kind === "meeting" ? "meeting" : `${kind} meeting`;
  return {
    title: `${entry.eventTitle} minutes · GHMO`,
    description: `Approved minutes of the ${meeting}${date ? ` on ${date}` : ""}, from the Greater Harrisburg Magar Organization.`
  };
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <PublicSectionTitle>{title}</PublicSectionTitle>
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
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader
        back={{ href: "/minutes", label: "All minutes" }}
        title={<span className="break-words">{entry.eventTitle}</span>}
        description={`${entry.meetingType}${date ? ` · ${date}` : ""}`}
      />
      {/* The order of the meeting and of the admin preview: Agenda, Discussion, Decisions, Action items (R4 C15). */}
      <List title="Agenda" items={entry.agenda} />
      {entry.discussionSummary ? (
        <section className="flex flex-col gap-2">
          <PublicSectionTitle>Discussion</PublicSectionTitle>
          <p className="whitespace-pre-line text-base text-foreground/90">{entry.discussionSummary}</p>
        </section>
      ) : null}
      <List title="Decisions" items={entry.decisions} />
      <List
        title="Action items"
        items={entry.actionItems.map(item => `${item.task}${item.dueDate ? ` (due ${formatShortDate(item.dueDate, DUE_DATE)})` : ""}`)}
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
    </PublicPage>
  );
}
