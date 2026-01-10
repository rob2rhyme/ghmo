import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import CommsBoardClient from "@/src/components/admin/comms/CommsBoardClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCommsPage() {
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/comms`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <AdminPageHeader
        title="Plans & Issues"
        description="Governed threads for proposals, plans, and issues that require admin decisions."
      />
      <CommsBoardClient actor={toPlain(actorInfo)} />
    </div>
  );
}
