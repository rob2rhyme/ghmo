import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/src/lib/utils";

/**
 * The one list style for rows of things (events, broadcasts, documents, members, action items…):
 * one bordered card with dividers. Put it inside an AdminSectionCard with `bare`, or on its own.
 */
export function AdminList({ children, label, bare, className }: { children: ReactNode; label?: string; bare?: boolean; className?: string }) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "divide-y divide-border",
        bare ? "-mx-4 border-y border-border md:-mx-6" : "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className
      )}
    >
      {children}
    </ul>
  );
}

type AdminListRowProps = {
  /** Main line (name or title). */
  title: ReactNode;
  /** Second line: date, who, counts… */
  meta?: ReactNode;
  /** Badges shown after the title. */
  badges?: ReactNode;
  /** Something at the start (a date tile, an avatar). */
  leading?: ReactNode;
  /** Buttons at the end (outline, size="row"). */
  actions?: ReactNode;
  /** Makes the whole row a link (the title becomes the link; actions stay clickable). */
  href?: Route;
  children?: ReactNode;
  className?: string;
};

export function AdminListRow({ title, meta, badges, leading, actions, href, children, className }: AdminListRowProps) {
  return (
    <li className={cn("relative flex min-h-14 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center md:px-5", href && "transition-colors hover:bg-accent/50", className)}>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link href={href} className="font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:underline">
              {title}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{title}</span>
          )}
          {badges}
        </div>
        {meta ? <div className="mt-0.5 text-sm text-muted-foreground">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </li>
  );
}
