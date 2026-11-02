import * as React from "react";
import { cn } from "@/src/lib/utils";

/** A labelled number ("Raised · $1,200"), for rows of figures inside a card. */
function StatTile({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</dd>
      {hint ? <dd className="text-sm text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** A row of StatTiles. */
function StatGrid({ children, className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl className={cn("grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3", className)} {...props}>
      {children}
    </dl>
  );
}

/** Progress toward a goal, with its own accessible label ("$1,200 of $50,000 raised"). */
function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

export { StatTile, StatGrid, ProgressBar };
