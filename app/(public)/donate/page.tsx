import { GoFundMeProDonationEmbed } from "@/src/components/GoFundMeProDonationEmbed";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DonatePage() {
  const community = await getCommunity();
  let totalRaised = 0;
  let goal: number | null | undefined;
  let statsWarning: string | null = null;

  try {
    const statsRes = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/donations/stats`);
    if (!statsRes.ok) {
      statsWarning = "Donation totals are temporarily unavailable.";
    } else {
      const { stats } = (await statsRes.json()) as { stats: { totalRaised?: number; goal?: number | null } };
      totalRaised = stats?.totalRaised ?? 0;
      goal = stats?.goal;
    }
  } catch {
    statsWarning = "Donation totals are temporarily unavailable.";
  }

  const campaigns = community.gofundmePro?.campaignIds || [];
  const GOFUNDME_PUBLIC_URL = "https://www.gofundme.com/f/replace-with-ghmo-gumba-project";
  // TODO: Replace GOFUNDME_PUBLIC_URL with the official GHMO Gumba Project GoFundMe campaign link.

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">
          Gumba Project - A Home for Our Language, Culture, and Community
        </h1>
        <p className="mt-3 text-base text-slate-700">
          Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to serve the growing Magar community in
          Harrisburg, Pennsylvania. As our population has increased, so has our responsibility to protect, preserve,
          and uplift our language, culture, and traditions for present and future generations.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <h2 className="text-lg font-semibold">Building a Gumba for the Magar Community in Harrisburg</h2>
          <p className="mt-2 text-sm">
            A 6-month community fundraising effort to preserve our language, culture, and traditions for future
            generations. Your support today helps create a permanent home for unity, learning, and faith.
          </p>
        </div>
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-600">Total Raised</p>
          <div className="mt-2 text-3xl font-bold text-primary">${totalRaised.toLocaleString()}</div>
          {goal ? <p className="text-sm text-slate-500">Goal ${goal.toLocaleString()}</p> : null}
          {statsWarning ? <p className="mt-2 text-xs text-amber-700">{statsWarning}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Why the Gumba Project Matters</h2>
        <p className="mt-3 text-slate-700">
          Our community needs a common place where we can come together, learn, and grow. Without a shared space, it
          becomes harder to pass on our language, cultural values, and spiritual traditions to our children and younger
          generations.
        </p>
        <p className="mt-3 text-slate-700">The GHMO Gumba Project is our vision to create that shared space.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
          <li>A place to teach the Magar language to people of all ages</li>
          <li>A center to preserve and practice Magar culture and traditions</li>
          <li>A home for Bhajan and cultural programs</li>
          <li>A space to socialize, unite, and strengthen our community bonds</li>
          <li>A symbol of unity, identity, and pride for Magar people in Harrisburg</li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Our Goal</h2>
        <p className="mt-3 text-slate-700">
          GHMO is launching a 6-month fundraising campaign to make the Gumba Project a reality. This is a mass donation
          effort, and every contribution - large or small - brings us closer to our goal.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
          <li>Planning and development of the Gumba space</li>
          <li>Cultural and language education programs</li>
          <li>Community gatherings and religious/cultural events</li>
          <li>Long-term preservation of Magar heritage</li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">A Message to Our Donors</h2>
        <p className="mt-3 text-slate-700">
          This project is not just about building a structure. It is about protecting our identity, educating our
          children, and creating a future where Magar language and culture continue to thrive.
        </p>
        <p className="mt-3 text-slate-700">Your generosity today will benefit:</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-slate-700">
          <li>Our elders, who carry our traditions</li>
          <li>Our youth, who will carry them forward</li>
          <li>Our entire community, now and for generations to come</li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">How to Contribute</h2>
        <p className="mt-3 text-slate-700">To ensure transparency and security, all donations are collected through GoFundMe.</p>
        <p className="mt-3 text-slate-700">
          Please click the &quot;Donate via GoFundMe&quot; button below to make your contribution. You will be redirected to
          the official GoFundMe page, where you can safely donate and support the GHMO Gumba Project.
        </p>
        <p className="mt-4 text-slate-700">
          Together, we can build a shared home for our language, culture, and community. Thank you for standing with
          GHMO and supporting this important mission.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Donate Now</h2>
            <p className="mt-2 text-slate-700">Support {community.name} through our official GoFundMe campaign.</p>
          </div>
          <a
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={GOFUNDME_PUBLIC_URL}
            rel="noreferrer"
            target="_blank"
          >
            Donate via GoFundMe
          </a>
        </div>
        <div className="mt-6">
          {community.gofundmePro?.enabled && campaigns.length > 0 ? (
            <GoFundMeProDonationEmbed campaignId={campaigns[0]} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              Configure GoFundMe Pro campaign IDs for this community to enable embedded donations.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
