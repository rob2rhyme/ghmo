//src/components/community/CommunityHeader.tsx
"use client";

import Link from "next/link";
import ThemeToggle from "@/src/components/ThemeToggle";
import SignOutButton from "@/src/components/SignOutButton";
import { useAuthSession } from "@/src/hooks/useAuthSession";

type CommunityHeaderProps = {
  name?: string;
};

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const { session } = useAuthSession();
  const hasSession = !!session?.authenticated;
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-primary">
          {label}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-700 dark:text-slate-200">
          <Link href="/">Home</Link>
          <Link href="/donate">Donate</Link>
          <Link href="/multimedia">Multimedia</Link>
          <Link href="/admin" className="font-semibold text-primary">
            Admin
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {hasSession ? <SignOutButton /> : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
