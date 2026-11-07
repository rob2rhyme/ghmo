import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import BroadcastDetailClient, { type BroadcastDetail } from "@/src/components/admin/broadcasts/BroadcastDetailClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { loadBroadcastDetail } from "@/src/lib/adminData.server";
import { footerFromEnv } from "@/src/lib/broadcastMail";
import { emailSetupProblem } from "@/src/components/admin/broadcasts/sendingSetup.server";
import type { SendProgress } from "@/src/lib/broadcastSender.server";
import type { AudienceOptions } from "@/src/lib/broadcast.shared";

/** Tab title: "Broadcast · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Broadcast" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BroadcastPage({ params }: { params: Promise<{ broadcastId: string }> }) {
  const { broadcastId } = await params;
  let uid: string;
  try {
    uid = (await requireActiveAdmin(undefined, COMMUNITY_SLUG)).actor.uid;
  } catch (error) {
    if (error instanceof AdminAccessError) redirect(`/admin/login?next=/admin/broadcasts/${encodeURIComponent(broadcastId)}`);
    throw error;
  }
  const detail = await loadBroadcastDetail(await requireActiveAdmin(undefined, COMMUNITY_SLUG), broadcastId);
  if (!detail) notFound();
  const { broadcast, recipientCount, progress, sendingBlocker, audienceOptions, audienceGroup } = detail as unknown as {
    broadcast: BroadcastDetail;
    recipientCount: number;
    audienceOptions: AudienceOptions;
    audienceGroup: { id: string; name: string | null; active: boolean; exists: boolean } | null;
    progress: SendProgress | null;
    sendingBlocker: string | null;
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={broadcast.subject || "Broadcast"}
        back={{ href: "/admin/broadcasts", label: "Broadcasts" }}
        description="Check the message, get a second admin's approval, then email it and post it to the group chats."
      />
      <BroadcastDetailClient
        initial={broadcast}
        recipientCount={recipientCount}
        audienceOptions={audienceOptions}
        audienceGroup={audienceGroup}
        uid={uid}
        footer={footerFromEnv()}
        initialProgress={progress}
        // Same check as the API, worded without setting names.
        sendingBlocker={sendingBlocker ? (emailSetupProblem() ?? sendingBlocker) : null}
      />
    </div>
  );
}
