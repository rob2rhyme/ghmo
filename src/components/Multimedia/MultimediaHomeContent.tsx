import { MediaSection } from "@/src/components/MediaSection";
import { internalFetch } from "@/src/lib/internalFetch";
import { loadFacebookMedia, loadInstagramFeature, loadTikTokFeature, loadYouTubeMedia, MediaFeed } from "@/src/lib/media";

type Feed = Awaited<ReturnType<typeof loadFacebookMedia>>;

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

export default async function MultimediaHomeContent() {
  const channelUrlFallback = "https://www.youtube.com/@greaterharrisburgmagarorga4597";
  const [facebook, youtube, tiktok, instagram] = await Promise.all([
    loadFacebookMedia(),
    fetchYouTubeFeed(),
    loadTikTokFeature(),
    loadInstagramFeature()
  ]);
  const youtubeFeed = {
    ...youtube,
    profileUrl: youtube.profileUrl || channelUrlFallback
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2 rounded-lg border border-border bg-card p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm uppercase tracking-wide text-primary/80">Multimedia</p>
        <h1 className="text-3xl font-bold">Stories & Highlights</h1>
        <p className="text-muted-foreground dark:text-slate-300">
          Aggregated social content across Facebook, YouTube, TikTok, and Instagram. API-ready when tokens are present; graceful
          embeds otherwise.
        </p>
      </header>

      <MediaSection title="Facebook" feed={facebook as Feed} />
      <MediaSection title="YouTube" feed={youtubeFeed as Feed} variant="youtube" />
      <MediaSection title="TikTok" feed={tiktok as Feed} />
      <MediaSection title="Instagram" feed={instagram as Feed} />
    </div>
  );
}
