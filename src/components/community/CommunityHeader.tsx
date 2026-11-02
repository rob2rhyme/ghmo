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
};

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, loading } = useAuthSession();
  const isAdmin = !loading && !!session?.adminId;
  const isAuthenticated = !loading && !!session?.authenticated;

  const links = [...PUBLIC_NAV, ...(isAdmin ? [{ href: "/admin" as Route, label: "Admin" }] : [])];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3 rounded-md text-foreground">
          <ThemeLogo alt="" priority className="size-9" />
          <span className="truncate text-base font-semibold">
            <span className="xl:hidden">GHMO</span>
            <span className="hidden xl:inline">{label}</span>
          </span>
        </Link>

        {/* Desktop: links in the bar. The current page is bold with an underline bar, not colour alone. */}
        <nav aria-label="Main" className="hidden shrink-0 items-center gap-1 lg:flex">
          {links.map(link => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
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
            <Button asChild size="lg" className="px-4">
              <Link href="/donate">
                <HandHeart aria-hidden="true" />
                Donate
              </Link>
            </Button>
            <ThemeToggle />
            {isAuthenticated ? <SignOutButton /> : null}
          </div>
        </nav>

        {/* Phones and tablets: Donate stays in the bar; everything else is in the menu. */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Button asChild size="lg" className="px-4">
            <Link href="/donate">
              <HandHeart className="hidden sm:block" aria-hidden="true" />
              Donate
            </Link>
          </Button>
          <ThemeToggle />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button variant="outline" size="icon" className="size-11" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu aria-hidden="true" />
            </Button>
            <SheetContent side="right" className="flex flex-col gap-4 p-4">
              <SheetHeader className="p-0 pr-10">
                <SheetTitle className="flex items-center gap-3">
                  <ThemeLogo alt="" className="size-9" />
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
                <Link href="/donate" onClick={() => setMenuOpen(false)}>
                  <HandHeart aria-hidden="true" />
                  Donate
                </Link>
              </Button>
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
