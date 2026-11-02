import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ProgressBar } from "@/src/components/ui/stat";
import { cn } from "@/src/lib/utils";

type AdminKpiCardProps = {
  label: string;
  value: string | number;
  /** One line of context under the number. */
  hint?: string;
  icon?: LucideIcon;
  /** 0..100: draws a progress bar. */
  progress?: number | null;
  href?: Route;
  /** A next step under the hint, e.g. a link. Only for cards without `href` (no links inside links). */
  action?: ReactNode;
  className?: string;
};

export default function AdminKpiCard({ label, value, hint, icon: Icon, progress, href, action, className }: AdminKpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums md:mt-3 md:text-3xl">{value}</p>
      {typeof progress === "number" ? <ProgressBar value={progress} max={100} label={`${label} progress`} className="mt-3" /> : null}
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      {action && !href ? <p className="mt-1 text-sm">{action}</p> : null}
    </>
  );
  const classes = cn("block rounded-xl border border-border bg-card p-4 shadow-xs md:p-5", className);
  return href ? (
    <Link href={href} className={cn(classes, "transition hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
