"use client";

import { useState } from "react";
import { UserCheck, UserMinus, UserPlus, UserX, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Select } from "@/src/components/ui/select";
import type { GroupChoice } from "@/src/components/admin/people/MemberGroupsDialog";

/** The most members one bulk change takes, the same as a group change (plan §28, D78). */
export const BULK_LIMIT = 200;

const people = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

/**
 * Shown while members are ticked (plan §28, D78): group changes and turning off or on. Consent, contacts, names and
 * deleting are never offered here (D79): those stay one person at a time.
 */
export function BulkActionBar({
  count,
  hasGroups,
  busy,
  onAddToGroup,
  onRemoveFromGroup,
  onTurnOff,
  onTurnOn,
  onClear
}: {
  count: number;
  hasGroups: boolean;
  busy: boolean;
  onAddToGroup: () => void;
  onRemoveFromGroup: () => void;
  onTurnOff: () => void;
  onTurnOn: () => void;
  onClear: () => void;
}) {
  const tooMany = count > BULK_LIMIT;
  return (
    <div role="region" aria-label="Selected members" className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-md sm:flex-row sm:flex-wrap sm:items-center">
      <p className="text-sm font-medium" role="status">
        {people(count)} selected{tooMany ? `. Choose ${BULK_LIMIT} or fewer at a time.` : ""}
      </p>
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {hasGroups ? (
          <>
            <Button size="row" variant="outline" disabled={busy || tooMany} onClick={onAddToGroup}>
              <UserPlus aria-hidden="true" /> Add to group…
            </Button>
            <Button size="row" variant="outline" disabled={busy || tooMany} onClick={onRemoveFromGroup}>
              <UserMinus aria-hidden="true" /> Remove from group…
            </Button>
          </>
        ) : null}
        <Button size="row" variant="outline" disabled={busy || tooMany} onClick={onTurnOn}>
          <UserCheck aria-hidden="true" /> Turn on
        </Button>
        <Button size="row" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy || tooMany} onClick={onTurnOff}>
          <UserX aria-hidden="true" /> Turn off…
        </Button>
        <Button size="row" variant="ghost" disabled={busy} onClick={onClear}>
          <X aria-hidden="true" /> Clear
        </Button>
      </div>
    </div>
  );
}

/** Pick the group to add the ticked members to, or take them out of. */
export function BulkGroupDialog({
  mode,
  groups,
  count,
  busy,
  onClose,
  onSave
}: {
  mode: "add" | "remove";
  groups: GroupChoice[];
  count: number;
  busy: boolean;
  onClose: () => void;
  onSave: (groupId: string) => Promise<void>;
}) {
  const choices = groups.filter(group => mode === "remove" || group.active);
  const [groupId, setGroupId] = useState("");
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (groupId) void onSave(groupId);
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "add" ? `Add ${people(count)} to a group` : `Remove ${people(count)} from a group`}</DialogTitle>
            <DialogDescription>{mode === "add" ? "Anyone already in the group is left as they are." : "Anyone not in the group is left as they are."}</DialogDescription>
          </DialogHeader>
          <Field label="Group">
            <Select value={groupId} onChange={e => setGroupId(e.target.value)} required>
              <option value="">Choose a group…</option>
              {choices.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!groupId}>
              {mode === "add" ? "Add to group" : "Remove from group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
