"use client";

import { Button } from "@/src/components/ui/button";
import { formatDateTime } from "@/src/lib/format";

/** Offered when an unsent draft was found on this device. */
export function DraftBanner({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
      <span className="min-w-0">
        You have an unsaved draft from {formatDateTime(savedAt)}. It is stored encrypted on this device only.
      </span>
      <span className="flex flex-wrap gap-2">
        <Button onClick={onRestore}>Restore draft</Button>
        <Button variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </span>
    </div>
  );
}
