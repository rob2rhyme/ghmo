import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ExternalLink, HandHeart } from "lucide-react";
import HomeMultimediaSection from "@/src/components/HomeMultimediaSection";
import ThemeLogo from "@/src/components/ThemeLogo";
import { UpcomingEvents } from "@/src/components/public/UpcomingEvents";
import { Button } from "@/src/components/ui/button";
import { getDonateUrl } from "@/src/lib/donateLink";

export default async function CommunityLanding() {
  const donateUrl = getDonateUrl();

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      {/* Hero */}
      <section
        aria-labelledby="home-title"
        className="flex flex-col items-center gap-5 rounded-xl border border-border bg-linear-to-b from-primary/10 to-card px-4 py-10 text-center shadow-xs sm:px-8 md:py-14"
      >
        <ThemeLogo priority className="size-28 md:size-36" />
        <h1 id="home-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl md:text-5xl">
          Greater Harrisburg Magar Organization
        </h1>
        <div className="w-full max-w-xl">
          <Image
            src="/assets/ghmo-akkha.png"
            alt="Greater Harrisburg Magar Organization, written in Akkha script"
            width={1287}
            height={126}
            className="h-auto w-full dark:hidden"
            priority
          />
          <Image
            src="/assets/ghmo-dark-mode.png"
            alt="Greater Harrisburg Magar Organization, written in Akkha script"
            width={1287}
            height={126}
            className="hidden h-auto w-full dark:block"
            priority
          />
        </div>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
          We are the Magar community of Greater Harrisburg, Pennsylvania — together since 2017, keeping our language, culture
          and traditions alive for the next generation.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Button asChild size="lg">
            <Link href="/c/ghmo/events">
              <CalendarDays aria-hidden="true" />
              Upcoming events
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/donate">
              <HandHeart aria-hidden="true" />
              Support the Gumba
            </Link>
          </Button>
        </div>
      </section>

      {/* About */}
      <section aria-labelledby="home-about" className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
        <div className="flex flex-col gap-3">
          <h2 id="home-about" className="text-xl font-semibold tracking-tight md:text-2xl">
            About GHMO
          </h2>
          <p className="text-base">
            Greater Harrisburg Magar Organization (GHMO) was founded in 2017 to serve the growing Magar community in Harrisburg,
            Pennsylvania.
          </p>
          <p className="text-base text-muted-foreground">
            As our community grows, so does our responsibility to protect, preserve and uplift our language, culture and
            traditions for present and future generations. Our approved meeting minutes are open for everyone to read.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline" size="lg">
              <Link href="/minutes">Read meeting minutes</Link>
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:grid-cols-3 md:grid-cols-1 md:p-6">
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted-foreground">Founded</dt>
            <dd className="text-base font-semibold">2017</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted-foreground">Based in</dt>
            <dd className="text-base font-semibold">Harrisburg, Pennsylvania</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-muted-foreground">Working on</dt>
            <dd className="text-base font-semibold">The Gumba Project</dd>
          </div>
        </dl>
      </section>

      <UpcomingEvents limit={3} />

      {/* Gumba Project */}
      <section
        aria-labelledby="home-gumba"
        className="flex flex-col gap-5 rounded-xl border border-primary/20 bg-primary/5 p-6 md:flex-row md:items-center md:justify-between md:p-8"
      >
        <div className="flex min-w-0 max-w-2xl flex-col gap-2">
          <h2 id="home-gumba" className="text-xl font-semibold tracking-tight md:text-2xl">
            Help us build the Gumba
          </h2>
          <p className="text-base text-muted-foreground">
            The Gumba Project will give our community a permanent home in Harrisburg — a place to teach the Magar language, hold
            Bhajan and cultural programs, and come together. Every contribution, large or small, brings us closer.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap md:flex-col md:items-stretch lg:flex-row lg:items-center">
          {donateUrl ? (
            <Button asChild size="lg">
              <a href={donateUrl} target="_blank" rel="noreferrer">
                <HandHeart aria-hidden="true" />
                Donate
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">(opens GoFundMe in a new tab)</span>
              </a>
            </Button>
          ) : (
            <p className="text-sm font-semibold">Donations open soon</p>
          )}
          <Button asChild size="lg" variant="outline">
            <Link href="/donate">Read about the Gumba Project</Link>
          </Button>
        </div>
      </section>

      <HomeMultimediaSection />
    </div>
  );
}
