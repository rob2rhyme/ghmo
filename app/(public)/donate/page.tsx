//app/(public)/donate/page.tsx
import Image from "next/image";
import { Info } from "lucide-react";
import { GoFundMeProDonationEmbed } from "@/src/components/GoFundMeProDonationEmbed";
import { DonateAction } from "@/src/components/public/DonateAction";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getDonateUrl, getDonationEmbedCampaignId } from "@/src/lib/donateLink";
import { internalFetch } from "@/src/lib/internalFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DonatePage() {
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

  const donateUrl = getDonateUrl();
  const embedCampaignId = getDonationEmbedCampaignId();

  const hasGoal = goal != null && goal > 0;
  const percent = hasGoal ? Math.min(100, Math.round((totalRaised / (goal as number)) * 100)) : 0;
  const timeLeftLabel = formatTimeLeft(endAt);
  const showDonors = donorCount != null && donorCount > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 md:gap-12">
      {/* Hero: picture, title, one-line ask and the main action */}
      <section aria-labelledby="donate-title" className="flex flex-col gap-6">
        <div className="relative h-56 overflow-hidden rounded-xl border border-border bg-muted sm:h-72 md:h-96">
          <Image
            src="/assets/Ghmo-building.png"
            alt="GHMO community building"
            fill
            priority
            sizes="(min-width: 960px) 896px, 100vw"
            className="object-cover object-center"
          />
        </div>
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm font-semibold text-primary">Gumba Project</p>
          <h1 id="donate-title" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            A home for our language, culture, and community
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Help us build a Gumba for the Magar community in Harrisburg. Every contribution, large or small, brings us closer.
          </p>
          <DonateAction donateUrl={donateUrl} />
        </div>
      </section>

      {/* Campaign and progress */}
      <section aria-labelledby="donate-progress" className="flex flex-col gap-5 rounded-xl border border-primary/20 bg-primary/5 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="donate-progress" className="text-lg font-semibold">
            Building a Gumba for the Magar Community in Harrisburg
          </h2>
          <p className="text-base text-muted-foreground">
            A 6-month community fundraising effort to preserve our language, culture, and traditions for future generations.
            Your support today helps create a permanent home for unity, learning, and faith.
          </p>
        </div>

        {statsWarning ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            {statsWarning}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {totalRaised > 0 ? (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-3xl font-semibold tracking-tight">{currencyFormatter.format(totalRaised)}</span>
                <span className="text-base text-muted-foreground">
                  raised{hasGoal ? ` of ${currencyFormatter.format(goal as number)} goal` : ""}
                </span>
              </p>
            ) : (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-semibold tracking-tight">Be the first to give</span>
                {hasGoal ? (
                  <span className="text-base text-muted-foreground">Goal: {currencyFormatter.format(goal as number)}</span>
                ) : null}
              </p>
            )}

            {hasGoal ? (
              <div
                role="progressbar"
                aria-label="Raised so far"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${percent}% of the goal`}
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            ) : null}

            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4">
              {hasGoal ? (
                <div className="flex flex-col">
                  <dt className="text-sm text-muted-foreground">Progress</dt>
                  <dd className="text-base font-semibold">{percent}% of goal</dd>
                </div>
              ) : null}
              {showDonors ? (
                <div className="flex flex-col">
                  <dt className="text-sm text-muted-foreground">Donors</dt>
                  <dd className="text-base font-semibold">{numberFormatter.format(donorCount as number)}</dd>
                </div>
              ) : null}
              <div className="flex flex-col">
                <dt className="text-sm text-muted-foreground">Time left</dt>
                <dd className="text-base font-semibold">{timeLeftLabel}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* The story, grouped */}
      <section aria-labelledby="donate-why" className="flex max-w-3xl flex-col gap-4">
        <h2 id="donate-why" className="text-xl font-semibold tracking-tight md:text-2xl">
          Why the Gumba Project matters
        </h2>
        <p className="text-base">
          Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to serve the growing Magar community in Harrisburg,
          Pennsylvania. As our population has increased, so has our responsibility to protect, preserve, and uplift our
          language, culture, and traditions for present and future generations.
        </p>
        <p className="text-base">
          Our community needs a common place where we can come together, learn, and grow. Without a shared space, it becomes
          harder to pass on our language, cultural values, and spiritual traditions to our children and younger generations.
        </p>
        <p className="text-base">The GHMO Gumba Project is our vision to create that shared space:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>A place to teach the Magar language to people of all ages</li>
          <li>A center to preserve and practice Magar culture and traditions</li>
          <li>A home for Bhajan and cultural programs</li>
          <li>A space to socialize, unite, and strengthen our community bonds</li>
          <li>A symbol of unity, identity, and pride for Magar people in Harrisburg</li>
        </ul>

        <h3 className="pt-4 text-lg font-semibold">Our goal</h3>
        <p className="text-base">
          GHMO is launching a 6-month fundraising campaign to make the Gumba Project a reality. This is a mass donation effort,
          and every contribution — large or small — brings us closer to our goal. Your gift supports:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>Planning and development of the Gumba space</li>
          <li>Cultural and language education programs</li>
          <li>Community gatherings and religious/cultural events</li>
          <li>Long-term preservation of Magar heritage</li>
        </ul>
      </section>

      <section aria-labelledby="donate-message" className="flex max-w-3xl flex-col gap-4">
        <h2 id="donate-message" className="text-xl font-semibold tracking-tight md:text-2xl">
          A message to our donors
        </h2>
        <figure className="border-l-4 border-primary py-1 pl-5">
          <blockquote className="text-xl font-medium leading-relaxed text-balance md:text-2xl">
            This project is not just about building a structure. It is about protecting our identity, educating our children,
            and creating a future where Magar language and culture continue to thrive.
          </blockquote>
        </figure>
        <p className="text-base">Your generosity today will benefit:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>Our elders, who carry our traditions</li>
          <li>Our youth, who will carry them forward</li>
          <li>Our entire community, now and for generations to come</li>
        </ul>
      </section>

      {/* How to give, with the action repeated */}
      <section
        aria-labelledby="donate-how"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs md:p-8"
      >
        <h2 id="donate-how" className="text-xl font-semibold tracking-tight md:text-2xl">
          How to contribute
        </h2>
        <p className="max-w-3xl text-base">
          To ensure transparency and security, all donations are collected through GoFundMe.
          {donateUrl
            ? " Use the “Donate via GoFundMe” button to go to the official GoFundMe page, where you can safely donate and support the GHMO Gumba Project."
            : " The official GoFundMe page will be linked here as soon as it opens."}
        </p>
        <p className="max-w-3xl text-base text-muted-foreground">
          Together, we can build a shared home for our language, culture, and community. Thank you for standing with GHMO and
          supporting this important mission.
        </p>
        <DonateAction donateUrl={donateUrl} />
        {embedCampaignId ? (
          <div className="pt-2">
            <GoFundMeProDonationEmbed campaignId={embedCampaignId} fallbackUrl={donateUrl} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** "12 days left", "5 hours left", "Ended", or "Ongoing" when there is no end date. */
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
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} left`;
  if (days > 0) return plural(days, "day");
  if (totalHours > 0) return plural(totalHours, "hour");
  return plural(totalMinutes, "minute");
}
