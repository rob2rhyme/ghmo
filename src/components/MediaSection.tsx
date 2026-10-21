import { MediaFeed } from "@/src/lib/media";

type Props = {
  title: string;
  feed: MediaFeed;
  profileLabel?: string;
  variant?: "default" | "youtube";
};

const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@greaterharrisburgmagarorga4597";

function formatViews(count: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

export function MediaSection({ title, feed, profileLabel, variant = "default" }: Props) {
  const hasCards = feed.items.length > 0;
  if (variant === "youtube") {
    const channelUrl = feed.profileUrl || DEFAULT_CHANNEL_URL;
    const items = feed.items.slice(0, 4);
    return (
      <section className="space-y-6 rounded-2xl border border-border/80 bg-linear-to-br from-slate-50 via-white to-slate-100 p-6 shadow-lg dark:border-slate-800/80 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground dark:text-slate-400">YouTube</p>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF0000] shadow-xs">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden="true">
                <path d="M8 6.5v11l9-5.5z" />
              </svg>
            </span>
            <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground dark:text-slate-300">
            {feed.mode === "api" ? "Latest videos with live stats" : "Channel highlights"}
            {feed.error ? ` · ${feed.error}` : ""}
          </p>
        </div>

        {feed.embedUrl ? (
          <div className="overflow-hidden rounded-xl border border-border bg-white/70 shadow-xs dark:border-slate-700 dark:bg-slate-900/60">
            <iframe src={feed.embedUrl} className="h-80 w-full border-0" loading="lazy" title={`${title} embed`} />
          </div>
        ) : null}

        {items.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map(item => (
              <article
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-border/80 bg-white/90 shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-900/80"
              >
                <a href={item.url} className="block" target="_blank" rel="noreferrer">
                  <div className="relative aspect-video overflow-hidden">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    ) : null}
                    <div className="absolute inset-0 bg-linear-to-t from-black/50 via-black/10 to-transparent" />
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-[#FF0000]/95 shadow-lg sm:h-16 sm:w-16">
                        <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-px text-white" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 px-4 py-3">
                    <h3 className="text-base font-semibold text-foreground dark:text-slate-100 line-clamp-2">{item.title}</h3>
                    {item.description ? <p className="text-sm text-muted-foreground dark:text-slate-300 line-clamp-2">{item.description}</p> : null}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {item.viewCount != null ? <span>{formatViews(item.viewCount)} views</span> : <span>{item.type || "video"}</span>}
                      {item.publishedAt ? <span>{new Date(item.publishedAt).toLocaleDateString()}</span> : null}
                    </div>
                  </div>
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No media items yet. Configure tokens/IDs or add curated links.</p>
        )}

        <div className="flex justify-center">
          <a
            href={channelUrl}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            target="_blank"
            rel="noreferrer"
          >
            Watch More
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground dark:text-slate-300">
            {feed.mode === "api" ? "Live feed via API" : feed.mode === "embed" ? "Embed or profile preview" : "Curated links"}
            {feed.error ? ` · ${feed.error}` : ""}
          </p>
        </div>
        {feed.profileUrl ? (
          <a href={feed.profileUrl} className="text-sm font-semibold text-primary" target="_blank" rel="noreferrer">
            {profileLabel ?? "Open profile"}
          </a>
        ) : null}
      </div>

      {feed.embedUrl ? (
        <div className="overflow-hidden rounded-lg border border-border bg-background shadow-xs dark:border-slate-700 dark:bg-slate-800">
          <iframe src={feed.embedUrl} className="h-80 w-full border-0" loading="lazy" title={`${title} embed`} />
        </div>
      ) : null}

      {hasCards ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {feed.items.map(item => (
            <article key={item.id} className="rounded-lg border border-border bg-background p-3 dark:border-slate-800 dark:bg-slate-800 md:p-4">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.title} className="mb-3 h-40 w-full rounded-md object-cover" />
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-foreground dark:text-slate-100">{item.title}</h3>
                {item.description ? <p className="text-sm text-muted-foreground dark:text-slate-300 line-clamp-3">{item.description}</p> : null}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="uppercase">{item.type || "post"}</span>
                  {item.publishedAt ? <span>{new Date(item.publishedAt).toLocaleDateString()}</span> : null}
                </div>
                <a href={item.url} className="text-sm font-semibold text-primary" target="_blank" rel="noreferrer">
                  View
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No media items yet. Configure tokens/IDs or add curated links.</p>
      )}
    </section>
  );
}
