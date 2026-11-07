"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

/** "Copy event…" (plan §30, D88–D89): a new draft with the same words and place and no dates; tasks come along by default. */
export default function CopyEventButton({ eventId, title, disabled }: { eventId: string; title: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [withTasks, setWithTasks] = useState(true);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/organizations/ghmo/events/${encodeURIComponent(eventId)}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withTasks })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; tasks?: number; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Couldn't copy the event. Try again.");
      toast.success(`Copied${data.tasks ? ` with ${data.tasks} task${data.tasks === 1 ? "" : "s"}` : ""}. Set the new dates, then save.`);
      setOpen(false);
      router.push(`/admin/events/${data.id}/edit` as Route);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't copy the event. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setOpen(true)} disabled={disabled}>
        <Copy aria-hidden="true" />
        Copy event…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Copy this event?"
        description={`A new draft "${title || "event"} (copy)" with the same description, place and flyer, and no dates. It isn't on the site until you publish it.`}
        confirmLabel="Copy event"
        busy={busy}
        onConfirm={copy}
      >
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={withTasks} onChange={e => setWithTasks(e.target.checked)} />
          <span>Also copy its tasks (not done, with nobody on them and no due dates)</span>
        </label>
      </ConfirmDialog>
    </>
  );
}
