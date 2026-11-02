//app/(admin)/admin/gumba-project/page.tsx
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotebookPen, Target } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { percentOf } from "@/src/lib/adminView";
import { formatDate, formatDateTime, formatShortDate, toDate, type DateInput } from "@/src/lib/format";
import { MeetingAttendance } from "@/src/lib/minutes";
import { resolveActorLabel } from "@/src/lib/actor";

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

  const statsRes = await internalFetch(
    `/api/organizations/${COMMUNITY_SLUG}/donations/stats`
  );
  if (!statsRes.ok) throw new Error("Failed to load donation stats");
  const { stats } = (await statsRes.json()) as {
    stats: {
      totalRaised?: number;
      goal?: number;
      lastUpdatedAt?: DateInput;
    };
  };

  const minutesRes = await internalFetch(`/api/admin/minutes`);
  if (!minutesRes.ok) {
    const body = await minutesRes.text().catch(() => "");
    throw new Error(`Failed to load minutes (${minutesRes.status}): ${body}`);
  }
  const { minutes } = await minutesRes.json();

  const totalRaised = stats?.totalRaised ?? 0;
  const goal = stats?.goal ?? 0;
  const lastUpdated = formatDateTime(stats?.lastUpdatedAt ?? null);
  const percent = percentOf(totalRaised, goal);
  const money = (value: number) => `$${value.toLocaleString("en-US")}`;
  const recentMinutes = (Array.isArray(minutes) ? [...minutes] : [])
    .sort((a, b) => (toDate(b.eventDate)?.getTime() ?? 0) - (toDate(a.eventDate)?.getTime() ?? 0))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="GUMBA Project"
        description="Our fundraising campaign to build a Gumba, a shared home for the Magar community's language, culture and gatherings in Harrisburg. Here you see what has been raised against the goal."
        actions={
          <Button asChild variant="outline">
            <Link href="/donate">See the public Donate page</Link>
          </Button>
        }
      />

      <AdminSectionCard title="Fundraising progress" description={lastUpdated ? `Last update from GoFundMe: ${lastUpdated}` : "No update from GoFundMe yet."}>
        {percent !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-2xl font-semibold text-foreground tabular-nums">{money(totalRaised)}</strong> of{" "}
              <span className="font-medium text-foreground tabular-nums">{money(goal)}</span> raised ({percent}%)
            </p>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Raised towards the goal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${money(totalRaised)} of ${money(goal)}`}
            >
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Raised" value={money(totalRaised)} />
              <Stat label="Goal" value={money(goal)} />
              <Stat label="Still to raise" value={money(Math.max(0, goal - totalRaised))} />
            </dl>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Raised so far: <strong className="text-lg font-semibold text-foreground tabular-nums">{money(totalRaised)}</strong>
            </p>
            <EmptyState
              icon={<Target aria-hidden="true" />}
              title="No fundraising goal yet"
              description="The goal comes from the GoFundMe campaign. It shows here, with a progress bar, once the site receives the campaign's totals from GoFundMe; there is nothing to set on this page."
            />
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        title="Recent meeting minutes"
        description="The last three meetings, for the decisions and tasks behind the project."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/minutes?mode=records">All minutes</Link>
          </Button>
        }
      >
        {recentMinutes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen aria-hidden="true" />}
            title="No meeting minutes yet"
            description="Minutes are written after a meeting under Meeting Minutes. The latest three show here."
            action={
              <Button asChild>
                <Link href="/admin/minutes">Write minutes</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {recentMinutes.map(entry => {
              const attendanceSummary = formatAdminAttendance(entry.attendance);
              const decisions: string[] = Array.isArray(entry.decisions) ? entry.decisions : [];
              const actionItems: MinutesActionItem[] = Array.isArray(entry.actionItems) ? entry.actionItems : [];
              const when = formatDate(entry.eventDate);
              return (
                <li key={entry.id} className="flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{entry.eventTitle}</p>
                      <p className="text-muted-foreground">
                        {entry.meetingType} · {when || "Date not recorded"}
                      </p>
                    </div>
                    <p className="text-muted-foreground">
                      {decisions.length} decision{decisions.length === 1 ? "" : "s"}
                    </p>
                  </div>
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
                            {action.task}
                            {action.assignedTo ? ` — ${action.assignedTo}` : ""}
                            {action.dueDate && formatShortDate(action.dueDate) ? ` (due ${formatShortDate(action.dueDate)})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-muted-foreground">
                    Recorded by {resolveActorLabel(entry.recordedBy)}
                    {attendanceSummary ? ` · ${attendanceSummary}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSectionCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold text-foreground tabular-nums">{value}</dd>
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
  return parts.length ? parts.join(" • ") : null;
}
