//app/(admin)/admin/gumba-project/page.tsx
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { MeetingAttendance } from "@/src/lib/minutes";
import { resolveActorLabel } from "@/src/lib/actor";

type MinutesActionItem = {
  task: string;
  assignedTo?: string;
  dueDate?: string | number | Date | null;
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
      lastUpdatedAt?: number | Date | null;
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
  const lastUpdatedAt =
    stats?.lastUpdatedAt instanceof Date
      ? stats.lastUpdatedAt.getTime()
      : typeof stats?.lastUpdatedAt === "number"
      ? stats.lastUpdatedAt
      : null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">GUMBA Project</h1>
        <p className="text-muted-foreground dark:text-slate-300">
          Project overview and fundraising progress.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md bg-primary/10 px-4 py-3">
            <p className="text-xs uppercase text-muted-foreground">Raised</p>
            <p className="text-2xl font-bold text-primary">
              ${totalRaised.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-highlight/10 px-4 py-3">
            <p className="text-xs uppercase text-muted-foreground">Goal</p>
            <p className="text-2xl font-bold text-highlight">
              ${goal.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-muted px-4 py-3 dark:bg-slate-800/70">
            <p className="text-xs uppercase text-muted-foreground">Last updated</p>
            <p className="text-lg font-semibold text-foreground dark:text-slate-100">
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Meeting minutes</h2>
          <Link
            href="/admin/minutes?mode=records"
            className="text-sm font-semibold text-primary"
          >
            Manage minutes
          </Link>
        </div>
        {Array.isArray(minutes) && minutes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No meeting minutes recorded yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {(Array.isArray(minutes) ? [...minutes] : [])
              .sort(
                (a, b) => Number(b.eventDate || 0) - Number(a.eventDate || 0)
              )
              .slice(0, 3)
              .map((entry) => {
                const attendanceSummary = formatAdminAttendance(
                  entry.attendance
                );
                return (
                  <div
                    key={entry.id}
                    className="rounded-md border border-border bg-background px-4 py-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {entry.eventTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.meetingType} •{" "}
                          {entry.eventDate
                            ? new Date(entry.eventDate).toLocaleString()
                            : "Date unavailable"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.decisions.length} decision
                        {entry.decisions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {entry.decisions.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-foreground/80">
                        {entry.decisions.map(
                          (decision: string, idx: number) => (
                            <li key={`${entry.id}-decision-${idx}`}>
                              {decision}
                            </li>
                          )
                        )}
                      </ul>
                    ) : null}
                    {entry.actionItems.length ? (
                      <div className="mt-2 text-xs text-foreground/80">
                        <p className="font-semibold text-muted-foreground">
                          Action items
                        </p>
                        <ul className="list-disc space-y-1 pl-5">
                          {entry.actionItems.map(
                            (action: MinutesActionItem, idx: number) => (
                              <li key={`${entry.id}-action-${idx}`}>
                                {action.task}
                                {action.assignedTo
                                  ? ` — ${action.assignedTo}`
                                  : ""}
                                {action.dueDate
                                  ? ` (due ${new Date(
                                      action.dueDate
                                    ).toLocaleDateString()})`
                                  : ""}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Recorded by {resolveActorLabel(entry.recordedBy)}
                      {attendanceSummary ? ` • ${attendanceSummary}` : ""}
                    </p>
                  </div>
                );
              })}
          </div>
        )}
      </div>
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
