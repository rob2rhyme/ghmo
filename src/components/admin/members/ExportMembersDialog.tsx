"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";

export type ExportChoice = { scope: "all" | "shown"; includePhones: boolean };

/**
 * Downloads the member list as a spreadsheet (CSV). The file is not encrypted, so the dialog says what is in it, that
 * phone numbers are optional and need an unlocked device, and that the download is written to the activity log.
 */
export default function ExportMembersDialog({
  total,
  shown,
  filtered,
  phonesReady,
  phoneHint,
  busy,
  onClose,
  onDownload
}: {
  total: number;
  /** How many the list shows with the current search and filters. */
  shown: number;
  /** True when a search or filter is narrowing the list. */
  filtered: boolean;
  /** True when this device is unlocked and can read phone numbers. */
  phonesReady: boolean;
  /** Why numbers can't be included, when they can't. */
  phoneHint: string;
  busy: boolean;
  onClose: () => void;
  onDownload: (choice: ExportChoice) => Promise<void>;
}) {
  const [scope, setScope] = useState<"all" | "shown">(filtered ? "shown" : "all");
  const [includePhones, setIncludePhones] = useState(false);
  const count = scope === "all" ? total : shown;
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export the member list</DialogTitle>
          <DialogDescription>
            A spreadsheet file (CSV) with each member&apos;s name, email, status, member since, city and state, groups, officer positions, and whether they can be emailed or
            called. Notes, family members and call history are never included.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-1" disabled={busy}>
          <legend className="mb-1 text-sm font-medium">Who to include</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="radio" name="export-scope" className="size-4 accent-primary" checked={scope === "all"} onChange={() => setScope("all")} />
            Everyone ({total})
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground">
            <input
              type="radio"
              name="export-scope"
              className="size-4 accent-primary"
              checked={scope === "shown"}
              disabled={!filtered}
              onChange={() => setScope("shown")}
            />
            {filtered ? `Only the ${shown} shown with the current search and filters` : "Only the ones shown (use a search or filter first)"}
          </label>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={includePhones && phonesReady}
              disabled={!phonesReady || busy}
              onChange={event => setIncludePhones(event.target.checked)}
            />
            <span>Include phone numbers, alternate numbers, language and household</span>
          </label>
          {!phonesReady ? <p className="pl-7 text-sm text-muted-foreground">{phoneHint}</p> : null}
        </div>

        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          The file is not encrypted. Keep it private, share it only with people who need it, and delete it when you are done. Every download is recorded in the activity log
          with who made it and how many people it holds, never their details.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={count === 0} onClick={() => void onDownload({ scope, includePhones: includePhones && phonesReady })}>
            Download {count} {count === 1 ? "member" : "members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
