import Link from "next/link";
import { MediaSection } from "@/src/components/MediaSection";
import { loadFacebookMedia, loadYouTubeMedia, MediaFeed } from "@/src/lib/media";

function toPreview(feed: MediaFeed) {
  return {
    ...feed,
    embedUrl: undefined,
    items: feed.items.slice(0, 2)
  };
}

export default async function HomeMultimediaSection() {
  const [facebook, youtube] = await Promise.all([loadFacebookMedia(), loadYouTubeMedia()]);
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-primary/80">Multimedia</p>
          <h2 className="text-2xl font-semibold">Latest highlights</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Browse a quick preview from Facebook and YouTube.</p>
        </div>
        <Link
          href="/multimedia"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
        >
          View all multimedia
        </Link>
      </div>
      <div className="space-y-4">
        <MediaSection title="Facebook" feed={toPreview(facebook)} />
        <MediaSection title="YouTube" feed={toPreview(youtube)} />
      </div>
    </section>
  );
}
