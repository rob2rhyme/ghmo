import Image from "next/image";
import { ExternalLink, Play } from "lucide-react";
import { MediaSection } from "@/src/components/MediaSection";
import { PublicPage, PublicPageHeader, PublicSectionTitle } from "@/src/components/public/PublicPage";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { SocialTiles } from "@/src/components/public/SocialTiles";
import { feedProfiles, loadPublicFeeds } from "@/src/components/public/feeds";
import { Button } from "@/src/components/ui/button";
import { COMMUNITY_NAME } from "@/src/lib/community";

/**
 * One large card for GHMO's YouTube channel, shown while no feed has posts to list. The picture is the
 * latest video's thumbnail when the feed has one, else the building artwork; the whole card is the link.
 */
function FeaturedYouTube({ href, thumbnail }: { href: string; thumbnail?: string | null }) {
  return (
    <section
      aria-labelledby="media-youtube"
      className="relative grid overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-colors hover:border-primary/50 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
    >
      <div className="relative aspect-video bg-muted md:aspect-auto md:min-h-64" aria-hidden="true">
        {thumbnail ? (
          <Image src={thumbnail} alt="" fill unoptimized sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
        ) : (
          <Image src="/assets/Ghmo-building.png" alt="" fill sizes="(min-width: 1152px) 440px, (min-width: 768px) 40vw, 100vw" className="object-cover" />
        )}
        <span className="absolute bottom-4 left-4 grid size-12 place-items-center rounded-full bg-background/90 text-foreground shadow-xs">
          <Play className="size-5 translate-x-px" />
        </span>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-3 p-6 md:p-8">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <SocialIcon source="youtube" className="size-4" />
          YouTube
        </p>
        <PublicSectionTitle id="media-youtube">{COMMUNITY_NAME}</PublicSectionTitle>
        <p className="text-base text-muted-foreground">Watch our programs, celebrations and community gatherings.</p>
        <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
          <a href={href} target="_blank" rel="noreferrer" className="after:absolute after:inset-0 after:rounded-xl">
            Open our YouTube channel
            <ExternalLink aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      </div>
    </section>
  );
}

/**
 * The Media page: sources with posts or videos as sections, the rest as profile tiles. While no feed has
 * posts, the YouTube channel is shown as one featured card instead of a lone tile.
 */
export default async function MultimediaHomeContent() {
  const feeds = await loadPublicFeeds();
  const withItems = feeds.filter(feed => feed.items.length > 0);
  const empty = feeds.filter(feed => feed.items.length === 0);
  const youtubeUrl = withItems.length ? null : (empty.find(feed => feed.source === "youtube")?.profileUrl ?? null);
  const youtubeThumbnail = feeds.find(feed => feed.source === "youtube")?.items[0]?.thumbnail ?? null;
  const profileOnly = feedProfiles(youtubeUrl ? empty.filter(feed => feed.source !== "youtube") : empty);

  return (
    <PublicPage className="gap-10">
      <PublicPageHeader
        title="Media"
        description={
          youtubeUrl
            ? "Watch our programs and celebrations on YouTube."
            : "Videos, photos and news from the Greater Harrisburg Magar community, and where to follow us."
        }
      />

      {youtubeUrl ? <FeaturedYouTube href={youtubeUrl} thumbnail={youtubeThumbnail} /> : null}

      {withItems.map(feed => (
        <MediaSection key={feed.source} feed={feed} headingLevel="h2" />
      ))}

      {profileOnly.length ? (
        <section aria-labelledby="media-follow" className="flex flex-col gap-4">
          <PublicSectionTitle id="media-follow">{withItems.length || youtubeUrl ? "More places to follow us" : "Follow us"}</PublicSectionTitle>
          <SocialTiles profiles={profileOnly} />
        </section>
      ) : null}
    </PublicPage>
  );
}
