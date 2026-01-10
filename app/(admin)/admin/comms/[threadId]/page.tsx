import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import CommsThreadDetailClient from "@/src/components/admin/comms/CommsThreadDetailClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";

type AdminCommsThreadPageProps = {
  params: { threadId: string };
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCommsThreadPage({ params }: AdminCommsThreadPageProps) {
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/comms/${params.threadId}`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <AdminPageHeader
        title="Thread Detail"
        description="Review discussion, propose a conclusion, and finalize when resolved."
      />
      <CommsThreadDetailClient threadId={params.threadId} actor={toPlain(actorInfo)} />
    </div>
  );
}
