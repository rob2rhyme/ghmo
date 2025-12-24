import { MediaSection } from "@/src/components/MediaSection";
import { loadFacebookMedia, loadInstagramFeature, loadTikTokFeature, loadYouTubeMedia } from "@/src/lib/media";

type Feed = Awaited<ReturnType<typeof loadFacebookMedia>>;

export default async function MultimediaHomeContent() {
  const [facebook, youtube, tiktok, instagram] = await Promise.all([
    loadFacebookMedia(),
    loadYouTubeMedia(),
    loadTikTokFeature(),
    loadInstagramFeature()
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm uppercase tracking-wide text-primary/80">Multimedia</p>
        <h1 className="text-3xl font-bold">Stories & Highlights</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Aggregated social content across Facebook, YouTube, TikTok, and Instagram. API-ready when tokens are present; graceful
          embeds otherwise.
        </p>
      </header>

      <MediaSection title="Facebook" feed={facebook as Feed} />
      <MediaSection title="YouTube" feed={youtube as Feed} />
      <MediaSection title="TikTok" feed={tiktok as Feed} />
      <MediaSection title="Instagram" feed={instagram as Feed} />
    </div>
  );
}
