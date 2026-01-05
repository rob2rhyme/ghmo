import { MeetingMinutesRecord } from "@/src/lib/minutes";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";
import { redirect } from "next/navigation";
import Link from "next/link";
import MinutesSearchClient from "@/src/modules/admin/MinutesSearchClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMinutesSearchPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/minutes`);
    }
    redirect(`/admin/login`);
  }

  const minutesRes = await internalFetch(`/api/admin/minutes`);
  if (!minutesRes.ok) {
    const body = await minutesRes.text().catch(() => "");
    throw new Error(`Failed to load minutes (${minutesRes.status}): ${body}`);
  }
  const data = await minutesRes.json();
  const minutes = toPlain(data.minutes ?? []) as MeetingMinutesRecord[];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Search meeting minutes</h1>
          <p className="text-sm text-slate-600">Find minutes by title, agenda, decisions, or attendees.</p>
        </div>
        <Link
          href="/admin?tab=minutes"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-primary hover:text-primary"
        >
          Add minutes
        </Link>
      </div>
      <MinutesSearchClient initialMinutes={minutes} />
    </div>
  );
}
