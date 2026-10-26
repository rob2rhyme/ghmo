import type { Route } from "next";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

type AdminActionCardProps = {
  href: Route;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** A compact "go there" tile for the dashboard. */
export default function AdminActionCard({ href, title, description, icon: Icon }: AdminActionCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 pr-5">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight
        className="absolute top-4 right-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}
