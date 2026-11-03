import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listAdminMinutes } from "@/src/lib/adminData.server";
import { readDonationStats } from "@/src/lib/publicData.server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { NotebookPen } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { ProgressBar, StatGrid, StatTile } from "@/src/components/ui/stat";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { percentOf } from "@/src/lib/adminView";
import { formatDate, formatDateTime, formatShortDate, toDate, type DateInput } from "@/src/lib/format";
import type { MeetingAttendance, MeetingMinutesRecord } from "@/src/lib/minutes";
import { resolveActorLabel } from "@/src/lib/actor";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { statusBadge } from "@/src/lib/statusBadges";

type MinutesActionItem = {
  task: string;
  assignedTo?: string;
  dueDate?: DateInput;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GumbaProjectPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/gumba-project`);
    }
    throw error;
  }

  // Admins see the stored totals as they are now, not the public pages' 5-minute copy.
  const [stats, minutes] = await Promise.all([readDonationStats(), listAdminMinutes() as Promise<MeetingMinutesRecord[]>]);

  const totalRaised = stats?.totalRaised ?? 0;
  const goal = stats?.goal ?? 0;
  const lastUpdated = formatDateTime(stats?.lastUpdatedAt ?? null, { timeZone: DEFAULT_TIMEZONE });
  const percent = percentOf(totalRaised, goal);
  const money = (value: number) => `$${value.toLocaleString("en-US")}`;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const recentMinutes = (Array.isArray(minutes) ? [...minutes] : [])
    .sort((a, b) => (toDate(b.eventDate)?.getTime() ?? 0) - (toDate(a.eventDate)?.getTime() ?? 0))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Gumba Project" description="Our fundraising campaign for a Gumba, a shared home for Magar language and culture in Harrisburg." />

      <AdminSectionCard
        title="Fundraising progress"
        description={lastUpdated ? `Last update from GoFundMe: ${lastUpdated}` : undefined}
        actions={
          <Button asChild variant="outline" size="row">
            <Link href="/donate">See the Donate page</Link>
          </Button>
        }
      >
        {percent !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground tabular-nums">{money(totalRaised)}</strong> of {money(goal)} raised ({percent}%)
            </p>
            <ProgressBar value={totalRaised} max={goal} label={`${money(totalRaised)} of ${money(goal)} raised`} />
            <StatGrid>
              <StatTile label="Raised" value={money(totalRaised)} />
              <StatTile label="Goal" value={money(goal)} />
              <StatTile label="Still to raise" value={money(Math.max(0, goal - totalRaised))} />
            </StatGrid>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {totalRaised > 0 ? (
              <StatGrid>
                <StatTile label="Raised so far" value={money(totalRaised)} />
              </StatGrid>
            ) : null}
            {/* One "nothing yet" line; the goal can't be set here, so the next step is the Donate page above. */}
            <p className="text-sm text-muted-foreground">
              {totalRaised > 0 ? "No goal yet." : "Nothing from GoFundMe yet."} The goal and a progress bar show here once the site receives the campaign&apos;s
              totals.
            </p>
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        title="Recent meeting minutes"
        description="The last three meetings, for the decisions and tasks behind the project."
        actions={
          <Button asChild variant="ghost" size="row">
            <Link href="/admin/minutes?mode=records">All minutes</Link>
          </Button>
        }
      >
        {recentMinutes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen aria-hidden="true" />}
            title="No meeting minutes yet"
            description="Minutes are written after a meeting under Meeting minutes. The latest three show here."
            action={
              <Button asChild variant="outline" size="row">
                <Link href="/admin/minutes">Write minutes</Link>
              </Button>
            }
          />
        ) : (
          <AdminList bare label="Recent meeting minutes">
            {recentMinutes.map(entry => {
              const attendanceSummary = formatAdminAttendance(entry.attendance);
              const decisions: string[] = Array.isArray(entry.decisions) ? entry.decisions : [];
              const actionItems: MinutesActionItem[] = Array.isArray(entry.actionItems) ? entry.actionItems : [];
              const when = formatDate(entry.eventDate, { timeZone: DEFAULT_TIMEZONE });
              const badge = entry.status ? statusBadge("minutes", entry.status) : null;
              return (
                <AdminListRow
                  key={entry.id}
                  href={`/admin/minutes?minutesId=${encodeURIComponent(entry.id)}` as Route}
                  title={entry.eventTitle || "Untitled meeting"}
                  badges={badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                  meta={[entry.meetingType, when || "Date not recorded", plural(decisions.length, "decision", "decisions")].filter(Boolean).join(" · ")}
                >
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    {decisions.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-foreground">
                        {decisions.map((decision, idx) => (
                          <li key={`${entry.id}-decision-${idx}`}>{decision}</li>
                        ))}
                      </ul>
                    ) : null}
                    {actionItems.length ? (
                      <div className="text-foreground">
                        <p className="font-medium text-muted-foreground">Action items</p>
                        <ul className="list-disc space-y-1 pl-5">
                          {actionItems.map((action, idx) => (
                            <li key={`${entry.id}-action-${idx}`}>
                              {[action.task, action.assignedTo, action.dueDate && formatShortDate(action.dueDate) ? `due ${formatShortDate(action.dueDate)}` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="text-muted-foreground">
                      {["Recorded by " + resolveActorLabel(entry.recordedBy), attendanceSummary].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </AdminListRow>
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>
    </div>
  );
}

function normalizeAdminAttendance(
  value?: MeetingAttendance | string[]
): MeetingAttendance | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const present = value.map((item) => item.trim()).filter(Boolean);
    return present.length ? { present } : undefined;
  }
  const present = (value.present || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const absent = (value.absent || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const guests = (value.guests || [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (!present.length && !absent.length && !guests.length) return undefined;
  const result: MeetingAttendance = { present };
  if (absent.length) result.absent = absent;
  if (guests.length) result.guests = guests;
  return result;
}

function formatAdminAttendance(
  value?: MeetingAttendance | string[]
): string | null {
  const normalized = normalizeAdminAttendance(value);
  if (!normalized) return null;
  const parts: string[] = [];
  if (normalized.present && normalized.present.length) {
    parts.push(`Present: ${normalized.present.join(", ")}`);
  }
  if (normalized.absent && normalized.absent.length) {
    parts.push(`Absent: ${normalized.absent.join(", ")}`);
  }
  if (normalized.guests && normalized.guests.length) {
    parts.push(`Guests: ${normalized.guests.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
