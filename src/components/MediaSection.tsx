import Image from "next/image";
import { ExternalLink, Play } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { SOCIAL_META } from "@/src/components/public/socialMeta";
import { formatShortDate } from "@/src/lib/format";
import type { MediaFeed, MediaItem } from "@/src/lib/media";

type Props = {
  feed: MediaFeed;
  /** h2 on the Media page, h3 when the section sits under another heading. */
  headingLevel?: "h2" | "h3";
  /** Show at most this many items. */
  limit?: number;
};

function formatViews(count: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

/** One post or video as a card that opens it on the social site. */
export function MediaCard({ item }: { item: MediaItem }) {
  const date = item.publishedAt ? formatShortDate(item.publishedAt) : "";
  const meta = [item.viewCount != null ? `${formatViews(item.viewCount)} views` : "", date].filter(Boolean).join(" · ");
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left text-card-foreground shadow-xs transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-video bg-muted">
        {item.thumbnail ? (
          <Image src={item.thumbnail} alt="" fill unoptimized sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : null}
        {item.type === "video" ? (
          <span className="absolute bottom-3 left-3 grid size-10 place-items-center rounded-full bg-background/90 text-foreground shadow-xs">
            <Play className="size-4 translate-x-px" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 text-base font-semibold group-hover:underline">{item.title}</h3>
        {item.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p> : null}
        {meta ? <p className="mt-auto pt-2 text-sm text-muted-foreground">{meta}</p> : null}
        <span className="sr-only">(opens in a new tab)</span>
      </div>
    </a>
  );
}

/**
 * One social source with posts or videos, all in the same style. A source with no items renders nothing:
 * show its profile link with SocialTiles instead. Setup details and feed errors are never shown.
 */
export function MediaSection({ feed, headingLevel = "h2", limit }: Props) {
  const items = limit ? feed.items.slice(0, limit) : feed.items;
  if (!items.length) return null;
  const meta = SOCIAL_META[feed.source];
  const Heading = headingLevel;
  const headingId = `media-${feed.source}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <SocialIcon source={feed.source} />
          </span>
          <div className="min-w-0">
            <Heading id={headingId} className="text-lg font-semibold">
              {meta.name}
            </Heading>
            <p className="text-sm text-muted-foreground">{meta.latest}</p>
          </div>
        </div>
        {feed.profileUrl ? (
          <Button asChild variant="outline" size="lg">
            <a href={feed.profileUrl} target="_blank" rel="noreferrer">
              {meta.action}
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => (
          <li key={item.id} className="min-w-0">
            <MediaCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
