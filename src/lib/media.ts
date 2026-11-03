//src/lib/media.ts
export type MediaItem = {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  publishedAt?: string;
  type?: "video" | "image" | "post";
  description?: string;
  viewCount?: number;
};

/**
 * A social feed for the public pages. Without API keys a feed has no items, only the profile link
 * when one is configured: the site never shows stand-in photos or videos. `error` is for logs only.
 */
export type MediaFeed = {
  source: "facebook" | "youtube" | "tiktok" | "instagram";
  mode: "api" | "embed" | "links";
  items: MediaItem[];
  embedUrl?: string;
  profileUrl?: string;
  error?: string;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, MediaFeed>();

async function withCache(key: string, fetcher: () => Promise<Omit<MediaFeed, "fetchedAt">>): Promise<MediaFeed> {
  const existing = cache.get(key);
  const now = Date.now();
  if (existing && existing.fetchedAt > now - CACHE_TTL_MS) {
    return existing;
  }
  const data = await fetcher();
  const feed: MediaFeed = { ...data, fetchedAt: now };
  cache.set(key, feed);
  return feed;
}

export async function loadFacebookMedia(): Promise<MediaFeed> {
  return withCache("facebook", async () => {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const accessToken = process.env.FACEBOOK_GRAPH_TOKEN;
    const embedUrl = process.env.FACEBOOK_PAGE_URL;

    if (pageId && accessToken) {
      try {
        // Graph API placeholder; replace with a minimal fields projection when tokens are available.
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}/posts?fields=message,full_picture,permalink_url,created_time&limit=6&access_token=${accessToken}`
        );
        if (res.ok) {
          const json = await res.json();
          const items: MediaItem[] = (json.data || []).map((post: any) => ({
            id: post.id,
            title: post.message?.slice(0, 80) || "Facebook post",
            url: post.permalink_url,
            thumbnail: post.full_picture,
            publishedAt: post.created_time,
            type: "post"
          }));
          return { source: "facebook", mode: "api", items, embedUrl, profileUrl: embedUrl };
        }
      } catch (err: any) {
        return {
          source: "facebook",
          mode: "links",
          embedUrl,
          profileUrl: embedUrl,
          items: [],
          error: err?.message || "Facebook fetch failed"
        };
      }
    }

    return {
      source: "facebook",
      mode: embedUrl ? "embed" : "links",
      embedUrl,
      profileUrl: embedUrl,
      items: []
    };
  });
}

export async function loadYouTubeMedia(): Promise<MediaFeed> {
  return withCache("youtube", async () => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const channelUrl = process.env.YOUTUBE_CHANNEL_URL;
    const channelUrlFallback = "https://www.youtube.com/@greaterharrisburgmagarorga4597";
    const channelLink = channelUrl || channelUrlFallback;

    if (apiKey && channelId) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&maxResults=4&type=video`
        );
        if (res.ok) {
          const json = await res.json();
          const rawItems = json.items || [];
          const videoIds = rawItems
            .map((item: any) => item.id?.videoId || item.id)
            .filter((id: string | undefined) => Boolean(id)) as string[];
          const viewCounts = new Map<string, number>();
          let statsError: string | undefined;
          if (videoIds.length) {
            try {
              const statsRes = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&part=statistics&id=${videoIds.join(",")}`
              );
              if (statsRes.ok) {
                const statsJson = await statsRes.json();
                for (const stat of statsJson.items || []) {
                  const count = Number(stat.statistics?.viewCount);
                  if (Number.isFinite(count)) {
                    viewCounts.set(stat.id, count);
                  }
                }
              } else {
                statsError = "Unable to load YouTube statistics";
              }
            } catch (err: any) {
              statsError = err?.message || "YouTube statistics fetch failed";
            }
          }
          const items: MediaItem[] = rawItems.map((item: any) => {
            const id = item.id?.videoId || item.id;
            return {
              id,
              title: item.snippet?.title || "YouTube video",
              url: `https://www.youtube.com/watch?v=${id}`,
              thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
              publishedAt: item.snippet?.publishedAt,
              type: "video",
              description: item.snippet?.description,
              viewCount: viewCounts.get(id)
            };
          });
          return {
            source: "youtube",
            mode: "api",
            items,
            profileUrl: channelLink,
            error: statsError
          };
        }
      } catch (err: any) {
        return {
          source: "youtube",
          mode: "links",
          items: [],
          profileUrl: channelLink,
          error: err?.message || "YouTube fetch failed"
        };
      }
    }

    return {
      source: "youtube",
      mode: channelUrl ? "embed" : "links",
      embedUrl: channelUrl ? `${channelUrl}/videos` : undefined,
      profileUrl: channelLink,
      items: []
    };
  });
}

export async function loadTikTokFeature(): Promise<MediaFeed> {
  return withCache("tiktok", async () => {
    const profileUrl = process.env.TIKTOK_PROFILE_URL;
    const embedUrl = profileUrl ? `${profileUrl}?lang=en` : undefined;
    return {
      source: "tiktok",
      mode: embedUrl ? "embed" : "links",
      embedUrl,
      profileUrl,
      items: []
    };
  });
}

export async function loadInstagramFeature(): Promise<MediaFeed> {
  return withCache("instagram", async () => {
    const profileUrl = process.env.INSTAGRAM_PROFILE_URL;
    const embedUrl = profileUrl ? `${profileUrl}/embed` : undefined;
    return {
      source: "instagram",
      mode: embedUrl ? "embed" : "links",
      embedUrl,
      profileUrl,
      items: []
    };
  });
}
