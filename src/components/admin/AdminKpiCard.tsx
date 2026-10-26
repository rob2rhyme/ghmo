import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
  className?: string;
};

export default function AdminKpiCard({ label, value, hint, icon: Icon, progress, href, className }: AdminKpiCardProps) {
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
      {typeof progress === "number" ? (
        <div
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
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
