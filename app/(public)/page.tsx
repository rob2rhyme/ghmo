import Image from "next/image";
import Link from "next/link";
import { CalendarDays, HandHeart } from "lucide-react";
import HomeMultimediaSection from "@/src/components/HomeMultimediaSection";
import { DonateAction } from "@/src/components/public/DonateAction";
import { HOME_HERO_IMAGE } from "@/src/components/public/homeHero";
import { PublicPage, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { UpcomingEvents } from "@/src/components/public/UpcomingEvents";
import { Button } from "@/src/components/ui/button";
import { getDonateUrl } from "@/src/lib/donateLink";
import { COMMUNITY_NAME } from "@/src/lib/community";
import { absoluteUrl } from "@/src/lib/siteMetadata";
import { jsonLdText, organizationJsonLd } from "@/src/lib/structuredData";

const AKKHA_ALT = "Greater Harrisburg Magar Organization, written in Akkha script";

export default async function CommunityLanding() {
  const donateUrl = getDonateUrl();

  return (
    <PublicPage className="gap-12 md:gap-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(organizationJsonLd({ name: COMMUNITY_NAME, alternateName: "GHMO", url: absoluteUrl("/"), logo: absoluteUrl("/icons/icon-512.png") })) }}
      />
      {/* Hero: who we are on the left, a picture on the right from desktop width (stacked on smaller screens). */}
      <section aria-labelledby="home-title" className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-5">
          <p className="text-sm font-semibold text-primary">Harrisburg, PA · since 2017</p>
          <h1 id="home-title" className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Greater Harrisburg Magar Organization
          </h1>
          <div className="w-full max-w-sm">
            {/* Shown at most 384px wide (max-w-sm), so ask for that size, not the full 1287px file. */}
            <Image src="/assets/ghmo-akkha.png" alt={AKKHA_ALT} width={1287} height={126} sizes="384px" className="h-auto w-full dark:hidden" />
            <Image src="/assets/ghmo-dark-mode.png" alt={AKKHA_ALT} width={1287} height={126} sizes="384px" className="hidden h-auto w-full dark:block" />
          </div>
          <p className="max-w-xl text-lg text-muted-foreground">
            We are the Magar community of Greater Harrisburg, keeping our language, culture and traditions alive for the next
            generation.
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/c/ghmo/events">
                <CalendarDays aria-hidden="true" />
                Upcoming events
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/donate">
                <HandHeart aria-hidden="true" />
                Support the Gumba
              </Link>
            </Button>
          </div>
        </div>
        {/* The whole scene, as the page's one preloaded picture (the Donate page crops the same art to the building). */}
        <div className="relative aspect-3/2 min-w-0 overflow-hidden rounded-xl border border-border bg-muted shadow-xs">
          <Image
            src={HOME_HERO_IMAGE.src}
            alt={HOME_HERO_IMAGE.alt}
            fill
            priority
            fetchPriority="high"
            // The page's largest paint: quality 60 is visibly the same here and much smaller (R4 P12).
            quality={60}
            sizes="(min-width: 1152px) 540px, (min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      {/* About */}
      <section aria-labelledby="home-about" className="flex max-w-3xl flex-col gap-3">
        <PublicSectionTitle id="home-about">About GHMO</PublicSectionTitle>
        <p className="text-base">
          Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to serve the growing Magar community in Harrisburg,
          Pennsylvania. We bring families together for gatherings, festivals and cultural programs.
        </p>
        <p className="text-base text-muted-foreground">Our approved meeting minutes are open for everyone to read.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/minutes">Read meeting minutes</Link>
          </Button>
        </div>
      </section>

      {/* No Suspense here: the page is built ahead and served from the cache, so the events and feeds are already in
          its HTML. A boundary would only send them after the footer, to be moved into place by script (R4 P4). */}
      <UpcomingEvents limit={3} />

      {/* Gumba Project */}
      <section
        aria-labelledby="home-gumba"
        className="grid gap-5 rounded-xl border border-primary/20 bg-primary/5 p-6 md:p-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-8"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <PublicSectionTitle id="home-gumba">Help us build the Gumba</PublicSectionTitle>
          <p className="text-base text-muted-foreground">
            The Gumba Project will give our community a permanent home in Harrisburg: a place to teach the Magar language, hold
            Bhajan and cultural programs, and come together. Every contribution, large or small, brings us closer.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start lg:flex-col lg:items-stretch">
          <DonateAction donateUrl={donateUrl} label="Donate" alternatives={false} />
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/donate">Read about the Gumba Project</Link>
          </Button>
        </div>
      </section>

      <HomeMultimediaSection />
    </PublicPage>
  );
}
