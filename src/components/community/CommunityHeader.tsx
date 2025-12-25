"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/src/components/ThemeToggle";
import SignOutButton from "@/src/components/SignOutButton";

type CommunityHeaderProps = {
  name?: string;
};

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || "Greater Harrisburg Magar Organization";
  const pathname = usePathname();
  const [authState, setAuthState] = useState<{
    authenticated: boolean;
    role: "admin" | "member" | null;
  } | null>(null);

  const fetchAuth = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      setAuthState(data);
    } catch {
      setAuthState({ authenticated: false, role: null });
    }
  };

  useEffect(() => {
    fetchAuth();
  }, [pathname]);

  useEffect(() => {
    const handler = () => fetchAuth();
    window.addEventListener("auth:changed", handler);
    return () => window.removeEventListener("auth:changed", handler);
  }, []);

  const hasSession = !!authState?.authenticated;
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-primary">
          {label}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-700 dark:text-slate-200">
          <Link href="/gumba-project">GUMBA Project</Link>
          <Link href="/document-generator">Document Generator</Link>
          <Link href="/donate">Donate</Link>
          <Link href="/multimedia">Multimedia</Link>
          <Link href="/admin" className="font-semibold text-primary">
            Admin
          </Link>
          <ThemeToggle />
          {hasSession ? <SignOutButton /> : null}
        </nav>
      </div>
    </header>
  );
}
