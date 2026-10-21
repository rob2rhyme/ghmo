//src/components/community/CommunityHeader.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "@/src/components/ThemeToggle";
import SignOutButton from "@/src/components/SignOutButton";
import AdminNavControls from "@/src/components/admin/AdminNavControls";
import { useAuthSession } from "@/src/hooks/useAuthSession";

type CommunityHeaderProps = {
  name?: string;
};

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const { session, loading } = useAuthSession();
  const isAuthenticated = !!session?.authenticated;
  const isAdmin = !!session?.adminId;
  const showAdmin = !loading && isAdmin;
  const showSignOut = !loading && isAuthenticated;
  return (
    <header className="border-b border-border bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-2.5 py-3 md:px-6 md:py-4">
        <Link href="/" className="flex items-center gap-3 text-primary">
          <Image
            src="/assets/logo-light.png"
            alt="GHMO Logo"
            width={36}
            height={36}
            className="h-8 w-auto dark:hidden"
            priority
          />
          <Image
            src="/assets/logo-dark.png"
            alt="GHMO Logo"
            width={36}
            height={36}
            className="hidden h-8 w-auto dark:block"
            priority
          />
          <span className="hidden text-lg font-semibold md:inline">{label}</span>
          <span className="sr-only">Greater Harrisburg Magar Organization</span>
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-foreground/80 dark:text-slate-200 md:flex">
          <div className="flex items-center gap-4">
            <Link href="/">Home</Link>
            <Link href="/donate">Donate</Link>
            <Link href="/multimedia">Multimedia</Link>
            <Link href="/admin" className="font-semibold text-primary">
              Admin
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {showAdmin ? <AdminNavControls /> : null}
            <ThemeToggle />
            {showSignOut ? <SignOutButton /> : null}
          </div>
        </nav>
        <nav className="flex items-center gap-4 text-sm text-foreground/80 dark:text-slate-200 md:hidden">
          <div className="flex items-center gap-3">
            <Link href="/">Home</Link>
            <Link href="/donate">Donate</Link>
            <Link href="/multimedia">Multimedia</Link>
            <Link href="/admin" className="font-semibold text-primary">
              Admin
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {showSignOut ? <SignOutButton /> : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
