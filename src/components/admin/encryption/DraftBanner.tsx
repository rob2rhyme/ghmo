"use client";

import { Button } from "@/src/components/ui/button";

/** Offered when an unsent draft was found on this device. */
export function DraftBanner({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
      <span>You have an unsaved draft from {new Date(savedAt).toLocaleString()}. It is stored encrypted on this device only.</span>
      <span className="flex gap-2">
        <Button size="sm" onClick={onRestore}>
          Restore draft
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Discard
        </Button>
      </span>
    </div>
  );
}
