import type { Metadata } from "next";
import Image from "next/image";
import { Info } from "lucide-react";
import { DonateAction } from "@/src/components/public/DonateAction";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { ProgressBar, StatGrid, StatTile } from "@/src/components/ui/stat";
import { getDonateUrl } from "@/src/lib/donateLink";
import { cachedPageData } from "@/src/lib/publicCache.server";
import { getDonationStats } from "@/src/lib/publicData.server";
import { pageOpenGraph } from "@/src/lib/siteMetadata";

const DESCRIPTION = "Help build a Gumba for the Magar community in Harrisburg: a home for our language, culture, and community.";

export const metadata: Metadata = {
  title: "Support the Gumba Project · GHMO",
  description: DESCRIPTION,
  openGraph: pageOpenGraph("Support the Gumba Project", DESCRIPTION),
  alternates: { canonical: "/donate" }
};

// Built once and refreshed every 5 minutes, or at once when the totals change (see publicCache.server.ts).
export const revalidate = 300;

export default async function DonatePage() {
  let totalRaised = 0;
  let goal: number | null | undefined;
  let donorCount: number | null | undefined;
  let endAt: number | string | Date | null | undefined;
  let statsWarning: string | null = null;

  const stats = cachedPageData(await getDonationStats(), "Donation totals");
  if (stats) {
    totalRaised = stats.totalRaised ?? 0;
    goal = stats.goal;
    donorCount = stats.donorCount;
    endAt = stats.endAt ?? null;
  } else {
    statsWarning = "We couldn't load the donation totals right now. Try again in a moment.";
  }

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
  const numberFormatter = new Intl.NumberFormat("en-US");

  const donateUrl = getDonateUrl();

  const hasGoal = goal != null && goal > 0;
  const percent = hasGoal ? Math.min(100, Math.round((totalRaised / (goal as number)) * 100)) : 0;
  const timeLeftLabel = formatTimeLeft(endAt);
  const showDonors = donorCount != null && donorCount > 0;
  // Nothing raised and no campaign link yet: say plainly that fundraising hasn't started, with no figures.
  const notStarted = !donateUrl && totalRaised <= 0;

  return (
    <PublicPage className="gap-10 md:gap-12">
      {/* Hero: title, one-line ask and the main action, with the picture beside it from desktop width */}
      <section aria-labelledby="donate-title" className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          <PublicPageHeader
            eyebrow="Gumba Project"
            titleId="donate-title"
            title="A home for our language, culture, and community"
            description="Help us build a Gumba for the Magar community in Harrisburg. Every contribution, large or small, brings us closer."
          />
          <DonateAction
            donateUrl={donateUrl}
            detail="When the campaign opens, every gift goes toward planning and building the Gumba, our community's permanent home in Harrisburg."
          />
        </div>
        {/* The same artwork as the home page, cropped to the building (the home page shows the whole scene). */}
        <div className="relative aspect-video min-w-0 overflow-hidden rounded-xl border border-border bg-muted shadow-xs">
          <Image
            src="/assets/ghmo-building.webp"
            alt="Artwork of the planned GHMO Gumba building, with children in traditional Magar dress outside"
            fill
            priority
            fetchPriority="high"
            // The page's largest paint: quality 60 is visibly the same here and much smaller (R4 P12).
            quality={60}
            sizes="(min-width: 1152px) 540px, (min-width: 1024px) 45vw, 100vw"
            className="object-cover object-top"
          />
        </div>
      </section>

      {/* Campaign and progress (nothing to show until the campaign opens: the notice above says so) */}
      {notStarted ? null : (
        <section aria-labelledby="donate-progress" className="flex max-w-3xl flex-col gap-5 rounded-xl border border-primary/20 bg-primary/5 p-5 md:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="donate-progress" className="text-lg font-semibold">
              Building a Gumba for the Magar community in Harrisburg
            </h2>
            <p className="text-base text-muted-foreground">
              A community fundraising campaign for a permanent home for unity, learning, and faith.
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
                <ProgressBar
                  value={totalRaised}
                  max={goal as number}
                  label={`${currencyFormatter.format(totalRaised)} of ${currencyFormatter.format(goal as number)} raised`}
                  className="h-3"
                />
              ) : null}

              {hasGoal || showDonors || timeLeftLabel ? (
                <StatGrid>
                  {hasGoal ? <StatTile label="Progress" value={`${percent}%`} hint="of the goal" /> : null}
                  {showDonors ? <StatTile label="Donors" value={numberFormatter.format(donorCount as number)} /> : null}
                  {timeLeftLabel ? <StatTile label="Time left" value={timeLeftLabel} /> : null}
                </StatGrid>
              ) : null}
            </div>
          )}
        </section>
      )}

      {/* The story, grouped */}
      <section aria-labelledby="donate-why" className="flex max-w-3xl flex-col gap-4">
        <PublicSectionTitle id="donate-why">Why the Gumba Project matters</PublicSectionTitle>
        <p className="text-base">
          Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to serve the growing Magar community in Harrisburg,
          Pennsylvania. As our population has increased, so has our responsibility to protect, preserve, and uplift our
          language, culture, and traditions for present and future generations.
        </p>
        <p className="text-base">
          Our community needs a common place where we can come together, learn, and grow. Without a shared space, it becomes
          harder to pass on our language, cultural values, and spiritual traditions to our children and younger generations.
        </p>
        {/* What a Gumba is, in the site's own words: for the board to confirm. */}
        <p className="text-base">
          A Gumba is a community and cultural center: a place to teach the Magar language, hold Bhajan and cultural
          programs, and come together. The GHMO Gumba Project is our vision to create that shared space:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>A place to teach the Magar language to people of all ages</li>
          <li>A center to preserve and practice Magar culture and traditions</li>
          <li>A home for Bhajan and cultural programs</li>
          <li>A space to socialize, unite, and strengthen our community bonds</li>
          <li>A symbol of unity, identity, and pride for Magar people in Harrisburg</li>
        </ul>

        <h3 className="pt-4 text-lg font-semibold">Our goal</h3>
        <p className="text-base">
          We are raising the money for the Gumba Project through a community fundraising campaign, open to everyone who
          wants to help. Every contribution, large or small, brings us closer to our goal. Your gift supports:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-base">
          <li>Planning and development of the Gumba space</li>
          <li>Cultural and language education programs</li>
          <li>Community gatherings and religious/cultural events</li>
          <li>Long-term preservation of Magar heritage</li>
        </ul>
      </section>

      <section aria-labelledby="donate-message" className="flex max-w-3xl flex-col gap-4">
        <PublicSectionTitle id="donate-message">A message to our donors</PublicSectionTitle>
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

      {/* How to give, with the action repeated once the campaign link is set */}
      <section
        aria-labelledby="donate-how"
        className="flex max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs md:p-8"
      >
        <PublicSectionTitle id="donate-how">How to contribute</PublicSectionTitle>
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
        {donateUrl ? <DonateAction donateUrl={donateUrl} /> : null}
      </section>
    </PublicPage>
  );
}

/** "12 days left", "5 hours left", "Ended", or null when there is no end date (then "Time left" is hidden). */
function formatTimeLeft(value?: number | string | Date | null): string | null {
  if (!value) return null;
  let timestamp: number | null = null;
  if (value instanceof Date) {
    timestamp = value.getTime();
  } else if (typeof value === "string") {
    const parsed = Date.parse(value);
    timestamp = Number.isNaN(parsed) ? null : parsed;
  } else if (typeof value === "number") {
    timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (!timestamp) return null;
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
