"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
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

const TRACK = "inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted p-1";

/** Shared look of one option; the selected one is tinted and ringed in the accent, so it reads in light and dark. */
export function segmentClass(selected: boolean, size: "default" | "sm" = "default") {
  return cn(
    "inline-flex items-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    size === "sm" ? "h-8 text-xs" : "h-11 text-sm sm:h-9",
    selected
      ? "bg-primary/15 text-foreground shadow-xs ring-1 ring-primary/40"
      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
  );
}

function Count({ value, selected }: { value: number; selected: boolean }) {
  return (
    <span className={cn("rounded-full px-1.5 text-xs tabular-nums", selected ? "bg-primary/15 text-foreground" : "bg-background/80")}>{value}</span>
  );
}

/**
 * One choice out of a few (filters, views). The selected option is shown by a tinted surface and a ring,
 * not by colour alone, and is announced with aria-pressed.
 */
function Segmented<T extends string>({ label, showLabel, options, value, onChange, className, size = "default" }: SegmentedProps<T>) {
  const id = React.useId();
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <span id={id} className={showLabel ? "text-sm font-medium text-muted-foreground" : "sr-only"}>
        {label}
      </span>
      <div role="group" aria-labelledby={id} className={TRACK}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={segmentClass(selected, size)}>
              {option.label}
              {typeof option.count === "number" ? <Count value={option.count} selected={selected} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SegmentedLink = { href: Route; label: React.ReactNode; active: boolean; count?: number };

/** The same look as Segmented for tabs that are separate pages (links, marked with aria-current). */
function SegmentedNav({ label, links, className }: { label: string; links: SegmentedLink[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex min-w-0", className)}>
      <div className={TRACK}>
        {links.map(link => (
          <Link key={String(link.href)} href={link.href} aria-current={link.active ? "page" : undefined} className={segmentClass(link.active)}>
            {link.label}
            {typeof link.count === "number" ? <Count value={link.count} selected={link.active} /> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export { Segmented, SegmentedNav };
