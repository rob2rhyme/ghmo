import { Metadata } from "next";
import { COMMUNITY_NAME } from "@/src/lib/community";
import MultimediaHomeContent from "@/src/components/Multimedia/MultimediaHomeContent";

export const metadata: Metadata = {
  title: `${COMMUNITY_NAME} | Multimedia`,
  description: "Videos and social media highlights from Facebook, YouTube, TikTok, and Instagram."
};

export default function MultimediaPage() {
  return <MultimediaHomeContent />;
}

type Feed = Awaited<ReturnType<typeof loadFacebookMedia>>;

function MediaSection({ title, feed }: { title: string; feed: Feed }) {
  const hasCards = feed.items.length > 0;
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {feed.mode === "api" ? "Live feed via API" : feed.mode === "embed" ? "Embed or profile preview" : "Curated links"}
            {feed.error ? ` · ${feed.error}` : ""}
          </p>
        </div>
        {feed.profileUrl ? (
          <a href={feed.profileUrl} className="text-sm font-semibold text-primary" target="_blank" rel="noreferrer">
            Open profile
          </a>
        ) : null}
      </div>

      {feed.embedUrl ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <iframe src={feed.embedUrl} className="h-80 w-full border-0" loading="lazy" title={`${title} embed`} />
        </div>
      ) : null}

      {hasCards ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {feed.items.map(item => (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.title} className="mb-3 h-40 w-full rounded-md object-cover" />
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                {item.description ? <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{item.description}</p> : null}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="uppercase">{item.type || "post"}</span>
                  {item.publishedAt ? <span>{new Date(item.publishedAt).toLocaleDateString()}</span> : null}
                </div>
                <a
                  href={item.url}
                  className="text-sm font-semibold text-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No media items yet. Configure tokens/IDs or add curated links.</p>
      )}
    </section>
  );
}
