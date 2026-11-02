import Link from "next/link";
import type { Route } from "next";
import ThemeLogo from "@/src/components/ThemeLogo";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { SOCIAL_META } from "@/src/components/public/socialMeta";
import { getSocialProfiles } from "@/src/components/public/socialProfiles";

const EXPLORE_LINKS: { href: Route; label: string }[] = [
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/minutes", label: "Minutes" },
  { href: "/donate", label: "Gumba Project" },
  { href: "/multimedia", label: "Media" }
];

const BOARD_LINKS: { href: Route; label: string }[] = [
  { href: "/admin/login", label: "Board member sign in" },
  { href: "/docs/onboarding", label: "Board member guide" }
];

const linkClass =
  "inline-flex min-h-11 items-center rounded-md text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";

/** Public site footer: who GHMO is, the main links, social profiles that are set up, and a small site credit. */
export function SiteFooter({ name }: { name: string }) {
  const socials = getSocialProfiles();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card text-card-foreground">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:px-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <ThemeLogo alt="" className="size-12" />
            <div className="min-w-0">
              <p className="text-base font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">Harrisburg, Pennsylvania · since 2017</p>
            </div>
          </div>
          {socials.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="GHMO on social media">
              {socials.map(profile => (
                <li key={profile.source}>
                  <a
                    href={profile.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`GHMO on ${SOCIAL_META[profile.source].name} (opens in a new tab)`}
                    className="grid size-11 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <SocialIcon source={profile.source} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-6 md:col-span-2 md:grid-cols-2">
          <nav aria-label="Footer" className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold">Explore</h2>
            <ul className="flex flex-col">
              {EXPLORE_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold">For board members</h2>
            <ul className="flex flex-col">
              {BOARD_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p>
            © {year} {name}. All rights reserved.
          </p>
          <p>Site by Robin Thapa</p>
        </div>
      </div>
    </footer>
  );
}
