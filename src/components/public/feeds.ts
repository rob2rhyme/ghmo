import "server-only";

import { GHMO_YOUTUBE_CHANNEL_URL, SOCIAL_ORDER, type SocialProfile } from "@/src/components/public/socialMeta";
import { internalFetch } from "@/src/lib/internalFetch";
import { loadFacebookMedia, loadInstagramFeature, loadTikTokFeature, loadYouTubeMedia, type MediaFeed } from "@/src/lib/media";

async function fetchYouTubeFeed(): Promise<MediaFeed> {
  try {
    const res = await internalFetch("/api/media/youtube");
    if (!res.ok) {
      return loadYouTubeMedia();
    }
    return (await res.json()) as MediaFeed;
  } catch {
    return loadYouTubeMedia();
  }
}

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
