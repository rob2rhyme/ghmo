import { adminDb } from "@/src/lib/firebaseAdmin";
import { getCommunity } from "@/src/lib/community";
import { assertMember, assertCommunityRole } from "@/src/lib/auth";
import { redirect } from "next/navigation";

export default async function GumbaProjectPage() {
  const community = await getCommunity();
  const memberAuth = await assertMember();
  const adminAuth = memberAuth ? null : await assertCommunityRole("admin");
  const auth = memberAuth || adminAuth;
  if (!auth) redirect(`/login?next=/gumba-project`);

  const statsSnap = await adminDb.doc(`community/${community.id}/donations/stats`).get();
  const stats = statsSnap.exists ? statsSnap.data() : { totalRaised: 0, goal: 0 };

  const timelineSnap = await adminDb
    .collection(`community/${community.id}/gumba/timeline`)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();
  const timeline = timelineSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">GUMBA Project</h1>
        <p className="text-slate-600 dark:text-slate-300">Project overview and fundraising progress.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md bg-primary/10 px-4 py-3">
            <p className="text-xs uppercase text-slate-600">Raised</p>
            <p className="text-2xl font-bold text-primary">${stats.totalRaised?.toLocaleString() || 0}</p>
          </div>
          <div className="rounded-md bg-secondary/10 px-4 py-3">
            <p className="text-xs uppercase text-slate-600">Goal</p>
            <p className="text-2xl font-bold text-secondary">${stats.goal?.toLocaleString() || 0}</p>
          </div>
          <div className="rounded-md bg-slate-100 px-4 py-3 dark:bg-slate-800/70">
            <p className="text-xs uppercase text-slate-600">Last updated</p>
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Timeline</h2>
          {"role" in auth && auth.role === "admin" ? (
            <a href={`/admin?tab=timeline`} className="text-sm font-semibold text-primary">
              Manage timeline
            </a>
          ) : null}
        </div>
        <div className="mt-4 space-y-4">
          {timeline.length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : null}
          {timeline.map(item => (
            <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                <span className="text-xs text-slate-500">
                  {item.timestamp ? new Date(item.timestamp.toDate?.() || item.timestamp).toLocaleString() : ""}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{item.body}</p>
              {item.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.tags.map((tag: string) => (
                    <span key={tag} className="rounded-full bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
