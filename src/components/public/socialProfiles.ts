import "server-only";

import { GHMO_YOUTUBE_CHANNEL_URL, SOCIAL_ORDER, type SocialProfile, type SocialSource } from "@/src/components/public/socialMeta";

function httpsUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The social profiles that are set up, from the same settings the media feeds use. Sites without a
 * profile link are left out; YouTube falls back to GHMO's own channel.
 */
export function getSocialProfiles(): SocialProfile[] {
  const urls: Record<SocialSource, string | null> = {
    facebook: httpsUrl(process.env.FACEBOOK_PAGE_URL),
    youtube: httpsUrl(process.env.YOUTUBE_CHANNEL_URL) ?? GHMO_YOUTUBE_CHANNEL_URL,
    instagram: httpsUrl(process.env.INSTAGRAM_PROFILE_URL),
    tiktok: httpsUrl(process.env.TIKTOK_PROFILE_URL)
  };
  return SOCIAL_ORDER.flatMap(source => {
    const href = urls[source];
    return href ? [{ source, href }] : [];
  });
}
