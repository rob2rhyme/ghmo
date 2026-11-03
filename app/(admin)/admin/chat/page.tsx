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
    // One full-height column: the shell's top bar and padding are taken off the screen height, and the chat
    // (marked data-fill) takes whatever is left below the header and any notice, so Send stays on screen.
    <div className="flex h-[calc(100dvh-7.25rem)] min-h-112 flex-col gap-6 lg:h-[calc(100dvh-8.25rem)]">
      <AdminPageHeader title="Admin chat" description="Quick updates and reminders between admins. Decisions belong in Plans & Issues." />
      <div className="flex min-h-0 flex-1 flex-col *:has-[>[data-fill]]:min-h-0 *:has-[>[data-fill]]:flex-1">
        <FirebaseAdminAuthBootstrap>
          <EncryptionGate what="admin chat" detail="Messages are readable only on approved admin devices.">
            <AdminChatClient actor={toPlain(actorInfo)} />
          </EncryptionGate>
        </FirebaseAdminAuthBootstrap>
      </div>
    </div>
  );
}
