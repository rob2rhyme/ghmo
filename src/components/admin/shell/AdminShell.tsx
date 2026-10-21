"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ExternalLink, Menu } from "lucide-react";
import SignOutButton from "@/src/components/SignOutButton";
import ThemeToggle from "@/src/components/ThemeToggle";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { cn } from "@/src/lib/utils";
import { ADMIN_NAV, isActiveNavItem } from "./adminNav";
import { EncryptionStatusBadge } from "@/src/components/admin/encryption/EncryptionStatusBadge";
import { E2eeProvider } from "@/src/lib/e2ee/client/E2eeProvider";

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 font-semibold text-foreground">
      <Image src="/assets/logo-light.png" alt="" width={32} height={32} className="h-8 w-auto dark:hidden" />
      <Image src="/assets/logo-dark.png" alt="" width={32} height={32} className="hidden h-8 w-auto dark:block" />
      <span className="leading-tight">
        GHMO <span className="text-muted-foreground">Admin</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {ADMIN_NAV.map(group => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
          {group.items.map(item => {
            const active = isActiveNavItem(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.noPrefetch ? false : undefined}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ShellFooterActions() {
  return (
    <div className="flex flex-col gap-3 border-t border-sidebar-border pt-4">
      <EncryptionStatusBadge />
      <div className="flex items-center justify-between gap-2">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Public site
      </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

/**
 * Admin layout (plan §5.2): sidebar on desktop, top bar + slide-out menu on phones.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <E2eeProvider>
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Brand />
        <div className="flex-1">
          <NavList />
        </div>
        <ShellFooterActions />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm md:hidden">
          <Brand />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <Button variant="outline" size="icon" aria-label="Open admin menu" onClick={() => setMenuOpen(true)}>
              <Menu aria-hidden="true" />
            </Button>
            <SheetContent side="left" className="flex flex-col gap-6 overflow-y-auto bg-sidebar p-4">
              <SheetHeader className="p-0 pr-8">
                <SheetTitle>
                  <Brand />
                </SheetTitle>
                <SheetDescription className="sr-only">Admin navigation</SheetDescription>
              </SheetHeader>
              <div className="flex-1">
                <NavList onNavigate={() => setMenuOpen(false)} />
              </div>
              <ShellFooterActions />
            </SheetContent>
          </Sheet>
        </header>

        <main id="admin-main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
    </E2eeProvider>
  );
}
