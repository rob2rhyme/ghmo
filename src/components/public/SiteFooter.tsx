import Link from "next/link";
import type { Route } from "next";
import { Mail } from "lucide-react";
import ThemeLogo from "@/src/components/ThemeLogo";
import { SocialIcon } from "@/src/components/public/SocialIcon";
import { SOCIAL_META } from "@/src/components/public/socialMeta";
import { getSocialProfiles } from "@/src/components/public/socialProfiles";
import { cn } from "@/src/lib/utils";

const EXPLORE_LINKS: { href: Route; label: string }[] = [
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/minutes", label: "Minutes" },
  { href: "/donate", label: "Gumba Project" },
  { href: "/multimedia", label: "Media" }
];

// The sign-in page and the guide sit in other root layouts and render per request, so prefetching them from
// the public pages is wasted work: these links load on click.
const BOARD_LINKS: { href: Route; label: string }[] = [
  { href: "/admin/login", label: "Board member sign in" },
  { href: "/docs/onboarding", label: "Board member guide" }
];

// 44 px tall on phones (touch), compact rows from tablet width up.
const linkClass =
  "inline-flex min-h-11 items-center rounded-md text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline md:min-h-8";

/**
 * Public site footer: who GHMO is, the main links, social profiles that are set up, a contact address when
 * one is configured (getContactEmail), and a small site credit.
 */
export function SiteFooter({ name, contactEmail = null }: { name: string; contactEmail?: string | null }) {
  const socials = getSocialProfiles();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card text-card-foreground">
      <div
        className={cn(
          "mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-6",
          contactEmail ? "md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]" : "md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
        )}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <ThemeLogo alt="" className="size-12" sizes="48px" />
            <div className="min-w-0">
              <p className="text-base font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">Harrisburg, Pennsylvania · since 2017</p>
            </div>
          </div>
          {socials.length ? (
            <ul className="-ml-2.5 flex flex-wrap items-center gap-1" aria-label="GHMO on social media">
              {socials.map(profile => (
                <li key={profile.source}>
                  <a
                    href={profile.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`GHMO on ${SOCIAL_META[profile.source].name} (opens in a new tab)`}
                    className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary md:size-10"
                  >
                    <SocialIcon source={profile.source} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className={cn("grid grid-cols-2 gap-6", contactEmail ? "md:col-span-3 md:grid-cols-3" : "md:col-span-2")}>
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
                  <Link href={link.href} prefetch={false} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {contactEmail ? (
            <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
              <h2 className="text-sm font-semibold">Contact</h2>
              <a href={`mailto:${contactEmail}`} className={cn(linkClass, "gap-2 break-all")}>
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                {contactEmail}
              </a>
            </div>
          ) : null}
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
