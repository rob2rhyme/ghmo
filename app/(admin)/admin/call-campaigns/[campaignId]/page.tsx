import { redirect } from "next/navigation";
import CampaignDetailClient from "@/src/components/admin/calling/CampaignDetailClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect(`/admin/login?next=${encodeURIComponent(`/admin/call-campaigns/${campaignId}`)}`);
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <CampaignDetailClient campaignId={campaignId} />
    </div>
  );
}
