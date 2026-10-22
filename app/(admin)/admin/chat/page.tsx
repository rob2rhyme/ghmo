import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import AdminChatClient from "@/src/components/admin/chat/AdminChatClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminChatPage() {
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/chat`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <AdminPageHeader
        title="Admin Chat"
        description="WhatsApp-style coordination for quick admin updates."
      />
      <FirebaseAdminAuthBootstrap>
        <EncryptionGate what="Admin Chat">
          <AdminChatClient actor={toPlain(actorInfo)} />
        </EncryptionGate>
      </FirebaseAdminAuthBootstrap>
    </div>
  );
}
