import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { redirect } from "next/navigation";
import Link from "next/link";
import TimelineListClient from "@/src/components/TimelineListClient";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";

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

  const statsRes = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/donations/stats`);
  if (!statsRes.ok) throw new Error("Failed to load donation stats");
  const { stats } = (await statsRes.json()) as { stats: { totalRaised?: number; goal?: number; lastUpdatedAt?: number | Date | null } };

  const timelineRes = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/gumba/timeline`);
  if (!timelineRes.ok) {
    const body = await timelineRes.text().catch(() => "");
    throw new Error(`Failed to load timeline (${timelineRes.status}): ${body}`);
  }
  const { timeline } = (await timelineRes.json()) as {
    timeline: { id: string; title?: string; body?: string; tags?: string[]; timestamp?: number | null }[];
  };

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
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">GUMBA Project</h1>
        <p className="text-slate-600 dark:text-slate-300">Project overview and fundraising progress.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md bg-primary/10 px-4 py-3">
            <p className="text-xs uppercase text-slate-600">Raised</p>
            <p className="text-2xl font-bold text-primary">${totalRaised.toLocaleString()}</p>
          </div>
          <div className="rounded-md bg-secondary/10 px-4 py-3">
            <p className="text-xs uppercase text-slate-600">Goal</p>
            <p className="text-2xl font-bold text-secondary">${goal.toLocaleString()}</p>
          </div>
          <div className="rounded-md bg-slate-100 px-4 py-3 dark:bg-slate-800/70">
            <p className="text-xs uppercase text-slate-600">Last updated</p>
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Timeline</h2>
          <Link href="/admin?tab=timeline" className="text-sm font-semibold text-primary">
            Manage timeline
          </Link>
        </div>
        <TimelineListClient items={timeline} />
      </div>
    </div>
  );
}
