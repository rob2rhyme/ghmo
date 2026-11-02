import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";
import ActionItemsClient from "@/src/components/admin/actions/ActionItemsClient";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ActionItemsPage() {
  let uid: string;
  try {
    uid = (await requireActiveAdmin(undefined, COMMUNITY_SLUG)).actor.uid;
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/action-items");
    throw error;
  }

  const res = await internalFetch("/api/admin/minutes");
  if (!res.ok) throw new Error(`Failed to load minutes (${res.status})`);
  const { minutes } = (await res.json()) as { minutes?: MeetingMinutesRecord[] };
  // Only approved minutes carry action items to track; their content is public, so no decryption is needed.
  const approved = toPlain((minutes ?? []).filter(record => record.status === "approved")) as MeetingMinutesRecord[];

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Action Items" description="Tasks agreed in approved meeting minutes. Mark each one done when it's finished." />
      <FirebaseAdminAuthBootstrap>
        <EncryptionGate what="the action items">
          <ActionItemsClient minutes={approved} uid={uid} />
        </EncryptionGate>
      </FirebaseAdminAuthBootstrap>
    </div>
  );
}
