"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; count?: number };

type SegmentedProps<T extends string> = {
  /** Visible or screen-reader name for the group, e.g. "Show" or "View". */
  label: string;
  /** Show the label before the options (default: screen readers only). */
  showLabel?: boolean;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "default" | "sm";
};

/**
 * One choice out of a few (filters, views, tabs). The selected option is shown by a filled
 * surface and a ring, not by colour alone, and is announced with aria-pressed.
 */
function Segmented<T extends string>({ label, showLabel, options, value, onChange, className, size = "default" }: SegmentedProps<T>) {
  const id = React.useId();
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <span id={id} className={showLabel ? "text-sm font-medium text-muted-foreground" : "sr-only"}>
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1">
        {options.map(option => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
                selected
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              )}
            >
              {option.label}
              {typeof option.count === "number" ? (
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", selected ? "bg-primary/10 text-primary" : "bg-background/70")}>
                  {option.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Segmented };
