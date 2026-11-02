import { ExternalLink } from "lucide-react";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { SOCIAL_META, type SocialProfile } from "@/src/components/public/socialMeta";

/** A row of link tiles, one per social profile ("Watch on YouTube", "Follow on Facebook"). */
export function SocialTiles({ profiles }: { profiles: SocialProfile[] }) {
  if (!profiles.length) return null;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
      {profiles.map(profile => {
        const meta = SOCIAL_META[profile.source];
        return (
          <li key={profile.source} className="min-w-0">
            <a
              href={profile.href}
              target="_blank"
              rel="noreferrer"
              className="group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <SocialIcon source={profile.source} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{meta.name}</span>
                <span className="text-sm text-muted-foreground">{meta.action}</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
