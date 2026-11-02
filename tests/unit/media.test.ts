import { beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_GRAPH_TOKEN",
  "FACEBOOK_PAGE_URL",
  "YOUTUBE_API_KEY",
  "YOUTUBE_CHANNEL_ID",
  "YOUTUBE_CHANNEL_URL",
  "TIKTOK_PROFILE_URL",
  "INSTAGRAM_PROFILE_URL"
];

describe("social feeds without API keys", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of KEYS) delete process.env[key];
  });

  it("show no stand-in photos, videos or setup hints", async () => {
    const media = await import("@/src/lib/media");
    const feeds = await Promise.all([media.loadFacebookMedia(), media.loadYouTubeMedia(), media.loadTikTokFeature(), media.loadInstagramFeature()]);
    for (const feed of feeds) {
      expect(feed.items).toEqual([]);
      expect(feed.error).toBeUndefined();
    }
    const serialized = JSON.stringify(feeds);
    expect(serialized).not.toMatch(/unsplash|dQw4w9WgXcQ|Configure|Set [A-Z_]+_URL/);
  });

  it("link only to real profiles", async () => {
    const media = await import("@/src/lib/media");
    expect((await media.loadFacebookMedia()).profileUrl).toBeUndefined();
    expect((await media.loadTikTokFeature()).profileUrl).toBeUndefined();
    expect((await media.loadInstagramFeature()).profileUrl).toBeUndefined();
    // GHMO's own YouTube channel is the built-in default.
    expect((await media.loadYouTubeMedia()).profileUrl).toMatch(/^https:\/\/www\.youtube\.com\/@greaterharrisburgmagar/);
  });

  it("use the configured profile links", async () => {
    process.env.FACEBOOK_PAGE_URL = "https://www.facebook.com/ghmo";
    process.env.INSTAGRAM_PROFILE_URL = "https://www.instagram.com/ghmo";
    const media = await import("@/src/lib/media");
    expect((await media.loadFacebookMedia()).profileUrl).toBe("https://www.facebook.com/ghmo");
    expect((await media.loadInstagramFeature()).profileUrl).toBe("https://www.instagram.com/ghmo");
  });
});
