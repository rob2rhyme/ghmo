import { GoFundMeProDonationEmbed } from "@/src/components/GoFundMeProDonationEmbed";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DonatePage() {
  const community = await getCommunity();
  const statsRes = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/donations/stats`);
  if (!statsRes.ok) throw new Error("Failed to load donation stats");
  const { stats } = (await statsRes.json()) as { stats: { totalRaised?: number; goal?: number | null } };

  const totalRaised = stats?.totalRaised ?? 0;
  const goal = stats?.goal;
  const campaigns = community.gofundmePro?.campaignIds || [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Support {community.name}</h1>
        <p className="text-slate-600 dark:text-slate-300">Funds power programs, events, and community services.</p>
        <div className="mt-3 text-3xl font-bold text-primary">${totalRaised.toLocaleString()}</div>
        {goal ? <p className="text-sm text-slate-500">Goal ${goal.toLocaleString()}</p> : null}
      </div>
      {community.gofundmePro?.enabled && campaigns.length > 0 ? (
        <GoFundMeProDonationEmbed campaignId={campaigns[0]} />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Configure GoFundMe Pro campaign IDs for this community to enable embedded donations.
        </div>
      )}
    </div>
  );
}
