"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";

export type GroupChoice = { id: string; name: string; active: boolean };

/** Which groups one member belongs to: tick or untick, then save. The server applies each change to its group. */
export default function MemberGroupsDialog({
  name,
  groups,
  current,
  busy,
  onClose,
  onSave
}: {
  name: string;
  groups: GroupChoice[];
  current: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (add: string[], remove: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(current));
  const add = groups.filter(g => picked.has(g.id) && !current.includes(g.id)).map(g => g.id);
  const remove = groups.filter(g => !picked.has(g.id) && current.includes(g.id)).map(g => g.id);
  const toggle = (id: string) =>
    setPicked(value => {
      const next = new Set(value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Groups for {name}</DialogTitle>
          <DialogDescription>Tick the teams this person is part of.</DialogDescription>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no groups yet. Make one on the Groups page.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {groups.map(group => (
              <li key={group.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={picked.has(group.id)} onChange={() => toggle(group.id)} />
                  <span>
                    {group.name}
                    {!group.active ? <span className="ml-2 text-muted-foreground">(switched off)</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={add.length === 0 && remove.length === 0} onClick={() => void onSave(add, remove)}>
            Save groups
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
