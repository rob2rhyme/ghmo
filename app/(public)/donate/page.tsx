//app/(public)/donate/page.tsx
import Image from "next/image";
import { GoFundMeProDonationEmbed } from "@/src/components/GoFundMeProDonationEmbed";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DonatePage() {
  const community = await getCommunity();
  let totalRaised = 0;
  let goal: number | null | undefined;
  let donorCount: number | null | undefined;
  let endAt: number | string | Date | null | undefined;
  let statsWarning: string | null = null;

  try {
    const statsRes = await internalFetch(
      `/api/organizations/${COMMUNITY_SLUG}/donations/stats`
    );
    if (!statsRes.ok) {
      statsWarning = "Donation totals are temporarily unavailable.";
    } else {
      const { stats } = (await statsRes.json()) as {
        stats: {
          totalRaised?: number;
          goal?: number | null;
          donorCount?: number | null;
          endAt?: number | string | Date | null;
        };
      };
      totalRaised = stats?.totalRaised ?? 0;
      goal = stats?.goal;
      donorCount = stats?.donorCount;
      endAt = stats?.endAt ?? null;
    }
  } catch {
    statsWarning = "Donation totals are temporarily unavailable.";
  }

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  const numberFormatter = new Intl.NumberFormat("en-US");

  const goalLabel = goal != null ? currencyFormatter.format(goal) : "—";
  const donorsLabel = donorCount != null ? numberFormatter.format(donorCount) : "—";
  const timeLeftLabel = formatTimeLeft(endAt);

  const campaigns = community.gofundmePro?.campaignIds || [];
  const GOFUNDME_PUBLIC_URL =
    "https://www.gofundme.com/f/replace-with-ghmo-gumba-project";
  // TODO: Replace GOFUNDME_PUBLIC_URL with the official GHMO Gumba Project GoFundMe campaign link.

  return (
    <main className="w-full">
      <section className="relative w-screen left-1/2 right-1/2 ml-[-50vw] mr-[-50vw] -mt-3 border-b border-border/60 bg-muted dark:border-slate-800/60 dark:bg-slate-950 md:-mt-8">
        <div className="mx-auto w-full max-h-[70vh] max-w-none">
          <div className="relative h-full w-full overflow-hidden aspect-3500/2333 max-h-[70vh]">
            <div className="absolute inset-0">
              <Image
                src="/assets/Ghmo-building.png"
                alt="GHMO community building"
                fill
                priority
                sizes="100vw"
                className="object-contain object-center"
              />
            </div>

            <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/35 via-black/10 to-transparent dark:from-black/45 dark:via-black/20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-white dark:to-slate-950" />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl space-y-6 px-[2.5%] py-8 sm:space-y-8 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            Gumba Project - A Home for Our Language, Culture, and Community
          </h2>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to
            serve the growing Magar community in Harrisburg, Pennsylvania. As
            our population has increased, so has our responsibility to protect,
            preserve, and uplift our language, culture, and traditions for
            present and future generations.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <h2 className="text-base font-semibold sm:text-lg">
              Building a Gumba for the Magar Community in Harrisburg
            </h2>
            <p className="mt-2 text-sm sm:text-base">
              A 6-month community fundraising effort to preserve our language,
              culture, and traditions for future generations. Your support today
              helps create a permanent home for unity, learning, and faith.
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-background p-4 sm:mt-6 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Raised</p>
                <p className="mt-2 text-2xl font-semibold text-primary">
                  {currencyFormatter.format(totalRaised)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goal</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {goalLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Donors</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {donorsLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time Left</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {timeLeftLabel}
                </p>
              </div>
            </div>
            {statsWarning ? (
              <p className="mt-2 text-xs text-amber-700">{statsWarning}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            Why the Gumba Project Matters
          </h2>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            Our community needs a common place where we can come together,
            learn, and grow. Without a shared space, it becomes harder to pass
            on our language, cultural values, and spiritual traditions to our
            children and younger generations.
          </p>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            The GHMO Gumba Project is our vision to create that shared space.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground/80 sm:mt-4 sm:text-base">
            <li>A place to teach the Magar language to people of all ages</li>
            <li>
              A center to preserve and practice Magar culture and traditions
            </li>
            <li>A home for Bhajan and cultural programs</li>
            <li>
              A space to socialize, unite, and strengthen our community bonds
            </li>
            <li>
              A symbol of unity, identity, and pride for Magar people in
              Harrisburg
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            Our Goal
          </h2>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            GHMO is launching a 6-month fundraising campaign to make the Gumba
            Project a reality. This is a mass donation effort, and every
            contribution - large or small - brings us closer to our goal.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground/80 sm:mt-4 sm:text-base">
            <li>Planning and development of the Gumba space</li>
            <li>Cultural and language education programs</li>
            <li>Community gatherings and religious/cultural events</li>
            <li>Long-term preservation of Magar heritage</li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            A Message to Our Donors
          </h2>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            This project is not just about building a structure. It is about
            protecting our identity, educating our children, and creating a
            future where Magar language and culture continue to thrive.
          </p>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            Your generosity today will benefit:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground/80 sm:mt-4 sm:text-base">
            <li>Our elders, who carry our traditions</li>
            <li>Our youth, who will carry them forward</li>
            <li>Our entire community, now and for generations to come</li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            How to Contribute
          </h2>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            To ensure transparency and security, all donations are collected
            through GoFundMe.
          </p>
          <p className="mt-2 text-sm text-foreground/80 sm:mt-3 sm:text-base">
            Please click the &quot;Donate via GoFundMe&quot; button below to
            make your contribution. You will be redirected to the official
            GoFundMe page, where you can safely donate and support the GHMO
            Gumba Project.
          </p>
          <p className="mt-3 text-sm text-foreground/80 sm:mt-4 sm:text-base">
            Together, we can build a shared home for our language, culture, and
            community. Thank you for standing with GHMO and supporting this
            important mission.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
                Donate Now
              </h2>
              <p className="mt-2 text-sm text-foreground/80 sm:text-base">
                Support {community.name} through our official GoFundMe campaign.
              </p>
            </div>
            <a
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-primary/90 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
              href={GOFUNDME_PUBLIC_URL}
              rel="noreferrer"
              target="_blank"
            >
              Donate via GoFundMe
            </a>
          </div>
          <div className="mt-4 sm:mt-6">
            {community.gofundmePro?.enabled && campaigns.length > 0 ? (
              <GoFundMeProDonationEmbed campaignId={campaigns[0]} />
            ) : (
              <div className="rounded-lg border border-dashed border-input bg-card p-4 text-sm text-muted-foreground sm:p-6">
                Configure GoFundMe Pro campaign IDs for this community to enable
                embedded donations.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatTimeLeft(value?: number | string | Date | null) {
  if (!value) return "Ongoing";
  let timestamp: number | null = null;
  if (value instanceof Date) {
    timestamp = value.getTime();
  } else if (typeof value === "string") {
    const parsed = Date.parse(value);
    timestamp = Number.isNaN(parsed) ? null : parsed;
  } else if (typeof value === "number") {
    timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (!timestamp) return "Ongoing";
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return "Ended";
  const totalMinutes = Math.ceil(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h`;
  return `${totalMinutes}m`;
}
