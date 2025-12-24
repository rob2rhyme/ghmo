export type MediaItem = {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  publishedAt?: string;
  type?: "video" | "image" | "post";
  description?: string;
};

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
          items: facebookFallbackItems(),
          error: err?.message || "Facebook fetch failed"
        };
      }
    }

    return {
      source: "facebook",
      mode: embedUrl ? "embed" : "links",
      embedUrl,
      profileUrl: embedUrl,
      items: facebookFallbackItems(),
      error: embedUrl ? undefined : "Configure FACEBOOK_PAGE_URL or GRAPH token for live posts"
    };
  });
}

export async function loadYouTubeMedia(): Promise<MediaFeed> {
  return withCache("youtube", async () => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const channelUrl = process.env.YOUTUBE_CHANNEL_URL;

    if (apiKey && channelId) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${channelId}&part=snippet&order=date&maxResults=6&type=video`
        );
        if (res.ok) {
          const json = await res.json();
          const items: MediaItem[] = (json.items || []).map((item: any) => ({
            id: item.id?.videoId || item.id,
            title: item.snippet?.title || "YouTube video",
            url: `https://www.youtube.com/watch?v=${item.id?.videoId || item.id}`,
            thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
            publishedAt: item.snippet?.publishedAt,
            type: "video",
            description: item.snippet?.description
          }));
          return { source: "youtube", mode: "api", items, profileUrl: channelUrl };
        }
      } catch (err: any) {
        return {
          source: "youtube",
          mode: "links",
          items: youtubeFallbackItems(channelUrl),
          profileUrl: channelUrl,
          error: err?.message || "YouTube fetch failed"
        };
      }
    }

    return {
      source: "youtube",
      mode: channelUrl ? "embed" : "links",
      embedUrl: channelUrl ? `${channelUrl}/videos` : undefined,
      profileUrl: channelUrl,
      items: youtubeFallbackItems(channelUrl),
      error: channelUrl ? undefined : "Configure YOUTUBE_API_KEY + YOUTUBE_CHANNEL_ID for live videos"
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
      items: [
        {
          id: "tiktok-feature",
          title: "Follow us on TikTok",
          url: profileUrl || "https://www.tiktok.com/",
          thumbnail: process.env.TIKTOK_FEATURE_THUMBNAIL,
          type: "video"
        }
      ],
      error: profileUrl ? undefined : "Set TIKTOK_PROFILE_URL for a live embed"
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
      items: [
        {
          id: "instagram-feature",
          title: "See our latest Instagram posts",
          url: profileUrl || "https://www.instagram.com/",
          thumbnail: process.env.INSTAGRAM_FEATURE_THUMBNAIL,
          type: "image"
        }
      ],
      error: profileUrl ? undefined : "Set INSTAGRAM_PROFILE_URL for live posts"
    };
  });
}

function facebookFallbackItems(): MediaItem[] {
  return [
    {
      id: "fb-1",
      title: "Community photo gallery",
      url: process.env.FACEBOOK_PAGE_URL || "#",
      thumbnail: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=60",
      type: "post"
    },
    {
      id: "fb-2",
      title: "Event highlights",
      url: process.env.FACEBOOK_PAGE_URL || "#",
      thumbnail: "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=800&q=60",
      type: "post"
    }
  ];
}

function youtubeFallbackItems(channelUrl?: string): MediaItem[] {
  const base = channelUrl || "https://www.youtube.com";
  return [
    {
      id: "yt-1",
      title: "Featured video",
      url: `${base}/watch?v=dQw4w9WgXcQ`,
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      type: "video"
    }
  ];
}
