"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { confirmationMatches } from "@/src/lib/memberDeletion";

type Preview = { confirmWith: string; removed: string[]; kept: string[] };

/**
 * Deleting a member (plan §20). Super admins only: the profile shows this only to them, and the server refuses anyone else.
 * It first asks the server what would be removed and kept, then asks for the member's name to be typed. Nothing is deleted
 * until both are done.
 */
export default function DeleteMemberDialog({
  memberId,
  label,
  busy,
  onClose,
  onDelete
}: {
  memberId: string;
  /** What the page calls this person, for the title. */
  label: string;
  busy: boolean;
  onClose: () => void;
  onDelete: (confirm: string) => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/organizations/ghmo/members/${encodeURIComponent(memberId)}/deletion`, { cache: "no-store" })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setPreview(data as Preview);
        else setFailed((data as { error?: string }).error || "Could not check what would be removed.");
      })
      .catch(() => {
        if (!cancelled) setFailed("Could not check what would be removed. Check your internet connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const matches = preview ? confirmationMatches(typed, { name: preview.confirmWith }) : false;

  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (matches) void onDelete(typed);
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete {label}?</DialogTitle>
            <DialogDescription>This cannot be undone. If you only want to stop contacting them, use Turn off on the Members list instead.</DialogDescription>
          </DialogHeader>

          {failed ? (
            <Alert variant="destructive">
              <AlertDescription>{failed}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div role="status">
              <span className="sr-only">Checking what would be removed…</span>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1 text-sm">
                <h3 className="font-medium">This will remove</h3>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {preview.removed.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <h3 className="font-medium">This will keep</h3>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {preview.kept.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <Field label={`Type "${preview.confirmWith}" to confirm`}>
                <Input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} />
              </Field>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={busy} disabled={!matches}>
              Delete member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
