"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ExternalLink, Menu, Search } from "lucide-react";
import SignOutButton from "@/src/components/SignOutButton";
import ThemeToggle from "@/src/components/ThemeToggle";
import { Button } from "@/src/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/src/components/ui/sheet";
import { cn } from "@/src/lib/utils";
import { initialsOf } from "@/src/lib/adminView";
import { ADMIN_NAV, isActiveNavItem } from "./adminNav";
import { AdminJumpDialog } from "./AdminJumpDialog";
import { EncryptionStatusBadge } from "@/src/components/admin/encryption/EncryptionStatusBadge";
import { E2eeProvider } from "@/src/lib/e2ee/client/E2eeProvider";

export type AdminShellUser = { name: string; email?: string; roleLabel: string };

const noopSubscribe = () => () => {};
const isMacClient = () => /mac|iphone|ipad/i.test(navigator.platform);

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex size-10 items-center justify-center rounded-xl bg-card shadow-xs ring-1 ring-border">
        <Image src="/assets/logo-light.png" alt="" width={32} height={32} className="h-7 w-auto dark:hidden" />
        <Image src="/assets/logo-dark.png" alt="" width={32} height={32} className="hidden h-7 w-auto dark:block" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-foreground">GHMO</span>
        <span className="text-xs font-medium text-muted-foreground">Admin console</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav aria-label="Admin" className="flex flex-col gap-3 lg:gap-2.5">
      {ADMIN_NAV.map(group => (
        <div key={group.label} className="flex flex-col gap-px">
          <p className="px-3 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
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
                  "group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[34px]",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-2 before:-left-1 before:w-1 before:rounded-full before:bg-primary"
                    : "text-foreground/75 hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function UserCard({ user }: { user: AdminShellUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-2.5">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-xs"
      >
        {initialsOf(user.name)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{user.email ? `${user.roleLabel} · ${user.email}` : user.roleLabel}</span>
      </span>
    </div>
  );
}

/** Desktop sidebar foot: who is signed in, and Sign out. Status and settings live in the top bar. */
function SidebarFooter({ user }: { user: AdminShellUser }) {
  return (
    <div className="flex items-center gap-2 border-t border-sidebar-border pt-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-xs"
      >
        {initialsOf(user.name)}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{user.roleLabel}</span>
      </span>
      <SignOutButton />
    </div>
  );
}

function ShellFooter({ user }: { user: AdminShellUser }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-sidebar-border pt-3">
      <UserCard user={user} />
      <EncryptionStatusBadge />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" className="mr-auto px-2 text-muted-foreground">
          <Link href="/">
            <ExternalLink aria-hidden="true" />
            Public site
          </Link>
        </Button>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </div>
  );
}

function JumpButton({ onClick, mac, className }: { onClick: () => void; mac: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Jump to a page"
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="flex-1 text-left">Jump to a page…</span>
      <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline">
        {mac ? "⌘ K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

/**
 * Admin layout (plan §5.2): sidebar on desktop, top bar + slide-out menu on phones. A "jump to a page"
 * search (Ctrl/⌘ K) is available everywhere.
 */
export default function AdminShell({ children, user }: { children: ReactNode; user: AdminShellUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const mac = useSyncExternalStore(noopSubscribe, isMacClient, () => false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setJumpOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <E2eeProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
        <a
          href="#admin-main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>

        <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="px-5 pt-4 pb-3">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            <NavList />
          </div>
          <div className="px-4 pb-3">
            <SidebarFooter user={user} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          {/* Phones: brand, search and menu. */}
          <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm lg:hidden">
            <Brand />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Jump to a page" onClick={() => setJumpOpen(true)}>
                <Search aria-hidden="true" />
              </Button>
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <Button variant="outline" size="icon" aria-label="Open admin menu" onClick={() => setMenuOpen(true)}>
                  <Menu aria-hidden="true" />
                </Button>
                <SheetContent side="left" className="flex flex-col gap-2 overflow-hidden bg-sidebar p-3">
                  <SheetHeader className="p-0 pr-8">
                    <SheetTitle>
                      <Brand />
                    </SheetTitle>
                    <SheetDescription className="sr-only">Admin navigation</SheetDescription>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <NavList onNavigate={() => setMenuOpen(false)} />
                  </div>
                  <div className="shrink-0">
                    <ShellFooter user={user} />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </header>

          {/* Desktop: page search on the left; encryption status, public site and theme on the right. */}
          <div className="sticky top-0 z-30 hidden items-center gap-3 border-b border-border bg-background/80 px-8 py-3 backdrop-blur-md lg:flex">
            <JumpButton onClick={() => setJumpOpen(true)} mac={mac} className="w-full max-w-sm" />
            <div className="ml-auto flex items-center gap-2">
              <EncryptionStatusBadge />
              <Button asChild variant="ghost" className="text-muted-foreground">
                <Link href="/">
                  <ExternalLink aria-hidden="true" />
                  Public site
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>

          <main id="admin-main" className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
      <AdminJumpDialog open={jumpOpen} onOpenChange={setJumpOpen} />
    </E2eeProvider>
  );
}
