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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Admin Chat"
        description="Quick updates and reminders between admins. Decisions belong in Plans & Issues."
      />
      <FirebaseAdminAuthBootstrap>
        <EncryptionGate what="admin chat" detail="Messages are readable only on approved admin devices.">
          <AdminChatClient actor={toPlain(actorInfo)} />
        </EncryptionGate>
      </FirebaseAdminAuthBootstrap>
    </div>
  );
}
