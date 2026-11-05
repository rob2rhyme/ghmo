"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";

/** Fixes a typo in a member's name. Super admins only; the change is recorded in the activity log. */
export default function RenameMemberDialog({
  currentName,
  label,
  nameRequired,
  busy,
  onClose,
  onSave
}: {
  currentName: string;
  /** What the list shows for this person now, for the title. */
  label: string;
  /** True for someone without an email: they are known by name and number, so the name can't be empty. */
  nameRequired: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const unchanged = name.trim() === currentName.trim();
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit name: {label}</DialogTitle>
            <DialogDescription>Correct a spelling mistake. Their email, phone number, consent and groups stay as they are. The change is recorded in the activity log.</DialogDescription>
          </DialogHeader>
          <Field label="Name" description={nameRequired ? "This person has no email, so they need a name." : "Leave empty to show their email instead."}>
            <Input value={name} maxLength={120} onChange={e => setName(e.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={unchanged || (nameRequired && !name.trim())}>
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
