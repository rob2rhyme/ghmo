import { MediaSection } from "@/src/components/MediaSection";
import { SocialTiles } from "@/src/components/public/SocialTiles";
import { feedProfiles, loadPublicFeeds } from "@/src/components/public/feeds";

/** The Media page: sources with posts or videos as sections, the rest as profile tiles. */
export default async function MultimediaHomeContent() {
  const feeds = await loadPublicFeeds();
  const withItems = feeds.filter(feed => feed.items.length > 0);
  const profileOnly = feedProfiles(feeds.filter(feed => feed.items.length === 0));

  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-3xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Media</h1>
        <p className="text-base text-muted-foreground">
          Videos, photos and news from the Greater Harrisburg Magar community, and where to follow us.
        </p>
      </header>

      {withItems.map(feed => (
        <MediaSection key={feed.source} feed={feed} headingLevel="h2" />
      ))}

      {profileOnly.length ? (
        <section aria-labelledby="media-follow" className="flex flex-col gap-4">
          <h2 id="media-follow" className="text-lg font-semibold">
            {withItems.length ? "More places to follow us" : "Follow us"}
          </h2>
          <SocialTiles profiles={profileOnly} />
        </section>
      ) : null}
    </div>
  );
}
