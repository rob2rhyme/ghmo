import "server-only";

import { unstable_cache } from "next/cache";
import { GHMO_YOUTUBE_CHANNEL_URL, SOCIAL_ORDER, type SocialProfile } from "@/src/components/public/socialMeta";
import { loadFacebookMedia, loadInstagramFeature, loadTikTokFeature, loadYouTubeMedia, type MediaFeed } from "@/src/lib/media";

/**
 * The YouTube feed, called directly (no hop through /api/media/youtube, which stays for the browser) and
 * kept in the shared data cache for 15 minutes, so a cold server function does not call YouTube again.
 */
const fetchYouTubeFeed = unstable_cache(() => loadYouTubeMedia(), ["youtube-feed"], { revalidate: 900 });

/** All four social feeds for the public pages, in display order. YouTube always links to GHMO's channel. */
export async function loadPublicFeeds(): Promise<MediaFeed[]> {
  const [facebook, youtube, tiktok, instagram] = await Promise.all([
    loadFacebookMedia(),
    fetchYouTubeFeed(),
    loadTikTokFeature(),
    loadInstagramFeature()
  ]);
  const feeds = [facebook, { ...youtube, profileUrl: youtube.profileUrl || GHMO_YOUTUBE_CHANNEL_URL }, tiktok, instagram];
  return SOCIAL_ORDER.map(source => feeds.find(feed => feed.source === source)).filter((feed): feed is MediaFeed => Boolean(feed));
}

/** Profile links of the feeds that have one. */
export function feedProfiles(feeds: MediaFeed[]): SocialProfile[] {
  return feeds.flatMap(feed => (feed.profileUrl ? [{ source: feed.source, href: feed.profileUrl }] : []));
}
