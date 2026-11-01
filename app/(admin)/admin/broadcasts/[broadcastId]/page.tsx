import { notFound, redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import BroadcastDetailClient, { type BroadcastDetail } from "@/src/components/admin/broadcasts/BroadcastDetailClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { footerFromEnv } from "@/src/lib/broadcastMail";
import type { SendProgress } from "@/src/lib/broadcastSender.server";

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
  const res = await internalFetch(`/api/admin/broadcasts/${encodeURIComponent(broadcastId)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load broadcast (${res.status})`);
  const { broadcast, recipientCount, progress, sendingBlocker } = (await res.json()) as {
    broadcast: BroadcastDetail;
    recipientCount: number;
    progress: SendProgress | null;
    sendingBlocker: string | null;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <AdminPageHeader title={broadcast.subject || "Broadcast"} description="Draft, test, get a second admin's approval, then email it and post it to the group chats." />
      <BroadcastDetailClient
        initial={broadcast}
        recipientCount={recipientCount}
        uid={uid}
        footer={footerFromEnv()}
        initialProgress={progress}
        sendingBlocker={sendingBlocker}
      />
    </div>
  );
}
