export type SocialSource = "facebook" | "youtube" | "tiktok" | "instagram";

export type SocialProfile = { source: SocialSource; href: string };

/** How each social site is named on the public pages. */
export const SOCIAL_META: Record<SocialSource, { name: string; action: string; latest: string }> = {
  facebook: { name: "Facebook", action: "Follow on Facebook", latest: "Latest posts from our Facebook page" },
  youtube: { name: "YouTube", action: "Watch on YouTube", latest: "Latest videos from our YouTube channel" },
  tiktok: { name: "TikTok", action: "Follow on TikTok", latest: "Latest videos from our TikTok" },
  instagram: { name: "Instagram", action: "Follow on Instagram", latest: "Latest photos from our Instagram" }
};

/** Display order everywhere. */
export const SOCIAL_ORDER: SocialSource[] = ["facebook", "youtube", "instagram", "tiktok"];

/** GHMO's own YouTube channel, used when YOUTUBE_CHANNEL_URL is not set (same default as src/lib/media.ts). */
export const GHMO_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@greaterharrisburgmagarorga4597";
