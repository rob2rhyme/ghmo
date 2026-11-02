"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

type Props = {
  campaignId: string;
  /** The GoFundMe campaign page, offered if the form doesn't load. */
  fallbackUrl?: string | null;
};

/** How long to wait for GoFundMe's script to fill in the form before offering the link instead. */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * GoFundMe Pro's embedded donation form. GoFundMe's script (loaded by the public layout) fills the
 * `.gfm-embed` element; React leaves that element empty and shows its own placeholder beside it, so the
 * two never fight over the same nodes. If nothing appears in time, the placeholder becomes a short
 * message with the GoFundMe link.
 */
export function GoFundMeProDonationEmbed({ campaignId, fallbackUrl }: Props) {
  const embedRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    const el = embedRef.current;
    if (!el) return;
    const check = () => {
      if (el.childElementCount > 0) {
        setStatus("loaded");
        return true;
      }
      return false;
    };
    if (check()) return;
    // Keep watching after the time limit: a slow form that arrives late still replaces the message.
    const observer = new MutationObserver(() => {
      if (check()) observer.disconnect();
    });
    observer.observe(el, { childList: true, subtree: true });
    const timer = window.setTimeout(() => setStatus(current => (current === "loading" ? "failed" : current)), LOAD_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative rounded-xl border border-border bg-card p-3 md:p-4">
      <div
        ref={embedRef}
        className="gfm-embed"
        data-campaign-id={campaignId}
        data-mode="donate"
        style={{ minHeight: status === "failed" ? 0 : 420 }}
      />
      {status === "loading" ? (
        <div role="status" className="absolute inset-3 flex flex-col gap-3 md:inset-4">
          <span className="sr-only">Loading the donation form…</span>
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-11 w-40" />
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="flex flex-col items-start gap-3 p-1">
          <p className="text-base">The donation form didn&apos;t load.</p>
          {fallbackUrl ? (
            <Button asChild size="lg">
              <a href={fallbackUrl} target="_blank" rel="noreferrer">
                Donate on GoFundMe instead
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Please refresh the page or try again later.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
