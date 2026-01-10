//app/(admin)/admin/minutes/page.tsx
import { MeetingMinutesRecord } from "@/src/lib/minutes";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MinutesEditorClient from "@/src/components/admin/minutes/MinutesEditorClient";
import MinutesRecordsClient from "@/src/components/admin/minutes/MinutesRecordsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminMinutesPageProps = {
  searchParams?: { mode?: string };
};

export default async function AdminMinutesPage({ searchParams }: AdminMinutesPageProps) {
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/minutes`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  const minutesRes = await internalFetch(`/api/admin/minutes`);
  if (!minutesRes.ok) {
    const body = await minutesRes.text().catch(() => "");
    throw new Error(`Failed to load minutes (${minutesRes.status}): ${body}`);
  }
  const data = await minutesRes.json();
  const minutes = toPlain(data.minutes ?? []) as MeetingMinutesRecord[];

  const mode = searchParams?.mode === "records" ? "records" : "new";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <AdminPageHeader
        title="Meeting Minutes"
        description="Create, approve, and export official minutes for each event."
        actions={
          <>
            <Link
              href="/admin/minutes?mode=new"
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
            >
              Create Minutes
            </Link>
            <Link
              href="/admin/minutes?mode=records"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-primary hover:text-slate-900"
            >
              View Records
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/minutes?mode=new"
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "new"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-500 hover:border-primary hover:text-slate-900"
          }`}
        >
          Create / Edit
        </Link>
        <Link
          href="/admin/minutes?mode=records"
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
            mode === "records"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 text-slate-500 hover:border-primary hover:text-slate-900"
          }`}
        >
          Records
        </Link>
      </div>

      {mode === "records" ? (
        <MinutesRecordsClient initialMinutes={minutes} />
      ) : (
        <MinutesEditorClient minutes={minutes} adminActor={toPlain(actorInfo)} />
      )}
    </div>
  );
}
