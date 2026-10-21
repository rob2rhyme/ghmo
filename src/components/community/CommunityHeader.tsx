"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import ThemeToggle from "@/src/components/ThemeToggle";
import SignOutButton from "@/src/components/SignOutButton";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { useAuthSession } from "@/src/hooks/useAuthSession";
import { cn } from "@/src/lib/utils";

type CommunityHeaderProps = {
  name?: string;
};

const PUBLIC_LINKS: { href: Route; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/donate", label: "Donate" },
  { href: "/multimedia", label: "Multimedia" }
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, loading } = useAuthSession();
  const isAdmin = !loading && !!session?.adminId;
  const isAuthenticated = !loading && !!session?.authenticated;

  const links = [...PUBLIC_LINKS, ...(isAdmin ? [{ href: "/admin" as Route, label: "Admin" }] : [])];

  const linkClass = (href: string) =>
    cn(
      "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
      isActive(pathname, href) ? "text-primary" : "text-foreground/80"
    );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-primary">
          <Image src="/assets/logo-light.png" alt="" width={36} height={36} className="h-8 w-auto dark:hidden" priority />
          <Image src="/assets/logo-dark.png" alt="" width={36} height={36} className="hidden h-8 w-auto dark:block" priority />
          <span className="truncate text-base font-semibold md:text-lg">
            <span className="md:hidden">GHMO</span>
            <span className="hidden md:inline">{label}</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(pathname, link.href) ? "page" : undefined}
              className={linkClass(link.href)}
            >
              {link.label}
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? <SignOutButton /> : null}
          </div>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button variant="outline" size="icon" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <Menu aria-hidden="true" />
            </Button>
            <SheetContent side="right" className="p-4">
              <SheetHeader className="p-0 pr-8">
                <SheetTitle>{label}</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col gap-1">
                {links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive(pathname, link.href) ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(linkClass(link.href), "min-h-11 text-base")}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
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
