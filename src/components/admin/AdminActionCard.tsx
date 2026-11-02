import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

type AdminActionCardProps = {
  href: Route;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** A compact "go there" tile for the dashboard. On phones it shows the title only (the description stays readable to screen readers). */
export default function AdminActionCard({ href, title, description, icon: Icon }: AdminActionCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs sm:items-start sm:gap-3.5 sm:p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:size-11 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-[18px] sm:size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 sm:pr-5">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="sr-only sm:not-sr-only sm:mt-0.5 sm:block sm:text-sm sm:text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight
        className="absolute top-4 right-4 hidden size-4 text-muted-foreground opacity-0 sm:block transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}
