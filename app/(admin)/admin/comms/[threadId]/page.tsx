import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import CommsThreadDetailClient from "@/src/components/admin/comms/CommsThreadDetailClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";

type AdminCommsThreadPageProps = {
  params: Promise<{ threadId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCommsThreadPage({ params }: AdminCommsThreadPageProps) {
  const { threadId } = await params;
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/comms/${threadId}`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <AdminPageHeader
        title="Thread Detail"
        description="Review discussion, propose a conclusion, and finalize when resolved."
      />
      <FirebaseAdminAuthBootstrap>
        <EncryptionGate what="Plans & Issues">
          <CommsThreadDetailClient threadId={threadId} actor={toPlain(actorInfo)} />
        </EncryptionGate>
      </FirebaseAdminAuthBootstrap>
    </div>
  );
}
