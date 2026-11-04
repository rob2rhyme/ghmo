"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HandHeart, Menu } from "lucide-react";
import ThemeLogo from "@/src/components/ThemeLogo";
import ThemeToggle from "@/src/components/ThemeToggle";
import SignOutButton from "@/src/components/SignOutButton";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { PUBLIC_NAV, isActivePath } from "@/src/components/public/publicNav";
import { useAuthSession } from "@/src/hooks/useAuthSession";
import { cn } from "@/src/lib/utils";

type CommunityHeaderProps = {
  name?: string;
  /** True once getDonateUrl() returns a GoFundMe link; until then the button invites support instead of "Donate". */
  donateOpen?: boolean;
  /**
   * Rendered in a secure root layout (sign-in, unsubscribe, signing, admin). Every public link then crosses into
   * another root layout, which loads as a full page: a prefetch from here is never used, so none is made.
   */
  secure?: boolean;
};

const DONATE_HREF = "/donate" as Route;

export function CommunityHeader({ name, donateOpen = false, secure = false }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, loading } = useAuthSession();
  const isAdmin = !loading && !!session?.adminId;
  const isAuthenticated = !loading && !!session?.authenticated;

  // The admin area is another root layout that renders per request: a prefetch from here is never used.
  // From a secure layout the public links cross root layouts too, so nothing here prefetches (R4 P5).
  const publicPrefetch: false | undefined = secure ? false : undefined;
  const links: { href: Route; label: string; prefetch?: false }[] = [
    ...PUBLIC_NAV.map(link => ({ ...link, prefetch: publicPrefetch })),
    ...(isAdmin ? [{ href: "/admin" as Route, label: "Admin", prefetch: false as const }] : [])
  ];
  const donateLabel = donateOpen ? "Donate" : "Support the Gumba";
  const donateCurrent = isActivePath(pathname, DONATE_HREF);
  // Signed out, the four links fit in the bar from tablet width; signed in (Admin link, Sign out) from desktop.
  const inlineFrom = isAuthenticated ? "lg" : "md";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" prefetch={publicPrefetch} className="flex min-h-11 min-w-0 items-center gap-3 rounded-md text-foreground">
          {/* Asks for the footer's 48 px size, so the logo downloads once per page (R4 P12). */}
          <ThemeLogo alt="" className="size-9" sizes="48px" />
          <span className="truncate text-base font-semibold">
            <span className="xl:hidden">GHMO</span>
            <span className="hidden xl:inline">{label}</span>
          </span>
        </Link>

        {/* Links in the bar. The current page is bold with an underline bar, not colour alone. */}
        <nav aria-label="Main" className={cn("hidden shrink-0 items-center gap-1", inlineFrom === "md" ? "md:flex" : "lg:flex")}>
          {links.map(link => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={link.prefetch}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  active
                    ? "font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary"
                    : "font-medium text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="ml-2 flex items-center gap-2">
            <DonateButton label={donateLabel} current={donateCurrent} prefetch={publicPrefetch} />
            <ThemeToggle />
            {isAuthenticated ? <SignOutButton /> : null}
          </div>
        </nav>

        {/* Smaller screens: the Gumba button stays in the bar; everything else is in the menu. */}
        <div className={cn("flex shrink-0 items-center gap-2", inlineFrom === "md" ? "md:hidden" : "lg:hidden")}>
          <DonateButton label={donateLabel} current={donateCurrent} iconFrom="sm" prefetch={publicPrefetch} />
          {/* On phones the theme switch moves into the menu so the bar fits at 375 px. */}
          <span className="hidden sm:contents">
            <ThemeToggle />
          </span>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button variant="outline" className="h-11 min-w-11 gap-2 px-3 sm:h-10" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu aria-hidden="true" />
              <span className="hidden sm:inline">Menu</span>
            </Button>
            <SheetContent side="right" className="flex flex-col gap-4 p-4">
              <SheetHeader className="p-0 pr-10">
                <SheetTitle className="flex items-center gap-3">
                  <ThemeLogo alt="" className="size-9" sizes="48px" />
                  <span className="min-w-0">{label}</span>
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col gap-1">
                {links.map(link => {
                  const active = isActivePath(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={link.prefetch}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center rounded-md border-l-4 px-3 text-base transition-colors hover:bg-accent hover:text-accent-foreground",
                        active ? "border-primary bg-accent font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <Button asChild size="lg" className="w-full">
                <Link href={DONATE_HREF} prefetch={publicPrefetch} aria-current={donateCurrent ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                  <HandHeart aria-hidden="true" />
                  {donateLabel}
                </Link>
              </Button>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4 sm:hidden">
                <span className="text-sm text-muted-foreground">Light or dark</span>
                <ThemeToggle />
              </div>
              {isAuthenticated ? (
                <div className="border-t border-border pt-4">
                  <SignOutButton />
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** The header's one call to action. On /donate itself it steps back to an outline button marked as the current page. */
function DonateButton({ label, current, iconFrom, prefetch }: { label: string; current: boolean; iconFrom?: "sm"; prefetch?: false }) {
  return (
    <Button asChild size="lg" variant={current ? "outline" : "default"} className="px-4">
      <Link href={DONATE_HREF} prefetch={prefetch} aria-current={current ? "page" : undefined}>
        <HandHeart className={iconFrom === "sm" ? "hidden sm:block" : undefined} aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
