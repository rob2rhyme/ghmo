 "use client";

import Link, { type LinkProps } from "next/link";
import SignOutButton from "@/src/components/SignOutButton";

type NextLinkProps = LinkProps<string>;

const NAV_LINKS: { href: NextLinkProps["href"]; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/gumba-project", label: "GUMBA Project" },
  { href: "/admin/document-generator", label: "Document Generator" },
  { href: "/admin/document-gallery", label: "Document Gallery" }
];

export default function AdminNavControls() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex flex-wrap gap-2">
        {NAV_LINKS.map(link => {
          const disablePrefetch = link.href === "/admin/document-generator" || link.href === "/admin/document-gallery";
          return (
            <Link
              key={link.label}
              href={link.href}
              prefetch={disablePrefetch ? false : undefined}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <SignOutButton />
    </div>
  );
}
