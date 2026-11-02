import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MediaCard } from "@/src/components/MediaSection";
import { Button } from "@/src/components/ui/button";
import { PublicSectionTitle } from "@/src/components/public/PublicPage";
import { SocialTiles } from "@/src/components/public/SocialTiles";
import { feedProfiles, loadPublicFeeds } from "@/src/components/public/feeds";

function publishedTime(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Home page "Follow us": the newest posts or videos (when the feeds have any) and a row of profile tiles.
 * Hidden while there are no posts and only one profile: the footer already links to it.
 */
export default async function HomeMultimediaSection() {
  const feeds = await loadPublicFeeds();
  const profiles = feedProfiles(feeds);
  const latest = feeds
    .flatMap(feed => feed.items.map(item => ({ key: `${feed.source}-${item.id}`, item })))
    .sort((a, b) => publishedTime(b.item.publishedAt) - publishedTime(a.item.publishedAt))
    .slice(0, 3);
  if (!latest.length && profiles.length <= 1) return null;

  return (
    <section aria-labelledby="home-follow" className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <PublicSectionTitle id="home-follow">Follow us</PublicSectionTitle>
        <p className="text-base text-muted-foreground">Photos, videos and news from our community.</p>
      </div>
      {latest.length ? (
        <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map(({ key, item }) => (
              <li key={key} className="min-w-0">
                <MediaCard item={item} />
              </li>
            ))}
          </ul>
          <Button asChild variant="ghost" size="lg" className="-ml-3 self-start px-3">
            <Link href="/multimedia">
              See all media
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      ) : null}
      <SocialTiles profiles={profiles} />
    </section>
  );
}
