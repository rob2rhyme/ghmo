import Link from "next/link";
import ThemeToggle from "@/src/components/ThemeToggle";
import { COMMUNITY_NAME } from "@/src/lib/community";

type CommunityHeaderProps = {
  name?: string;
};

export function CommunityHeader({ name }: CommunityHeaderProps) {
  const label = name || COMMUNITY_NAME;
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
        </nav>
      </div>
    </header>
  );
}
