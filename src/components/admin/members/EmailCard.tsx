"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AtSign, Pencil } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { memberDisplayName, normalizeMemberEmail, normalizeMemberName } from "@/src/lib/members";
import type { ProfileMember } from "./MemberProfileClient";

type Result = { member: ProfileMember; kind: "added" | "changed" | "removed"; oldKept: boolean };

async function putEmail(id: string, email: string): Promise<Result> {
  const res = await fetch(`/api/organizations/ghmo/members/${encodeURIComponent(id)}/email`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const data = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
  if (!res.ok || !data.member) throw new Error(data.error || "Could not save the email. Try again.");
  return data as Result;
}

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The member's email address (plan §25, Phase 18). Every admin sees it; only a super admin can add, change or remove it
 * (D57). Outside the encryption gate: the address is stored in plain text, so no device key is needed.
 */
export default function EmailCard({ member, superAdmin, onSaved }: { member: ProfileMember; superAdmin: boolean; onSaved: (member: ProfileMember) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const address = member.email || member.emailLower || "";
  const hasEmail = address.includes("@");
  const canRemove = hasEmail && Boolean(member.hasPhone) && Boolean(normalizeMemberName(member.name));

  const save = async (email: string) => {
    setBusy(true);
    try {
      const result = await putEmail(member.id, email);
      onSaved({ ...member, ...result.member });
      const said = result.kind === "removed" ? "Email removed" : result.kind === "added" ? "Email added" : "Email changed";
      toast.success(result.oldKept ? `${said}. The old address stays on the do-not-email list.` : said);
      setEditing(false);
      setRemoving(false);
      // The page title shows the address for someone without a name.
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the email. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      as="h3"
      icon={<AtSign aria-hidden="true" />}
      title="Email"
      actions={
        superAdmin ? (
          <Button variant="outline" size="row" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            {hasEmail ? "Edit email" : "Add email"}
          </Button>
        ) : undefined
      }
    >
      <p className="break-all text-sm" data-testid="member-email">
        {hasEmail ? address : <span className="text-muted-foreground">No email address. This member is reached by phone.</span>}
      </p>
      {!superAdmin ? <p className="text-sm text-muted-foreground">Only a super admin can change an email address.</p> : null}
      {editing ? (
        <EditEmailDialog
          member={member}
          current={hasEmail ? address : ""}
          busy={busy}
          canRemove={canRemove}
          onClose={() => setEditing(false)}
          onSave={save}
          onRemove={() => {
            setEditing(false);
            setRemoving(true);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${memberDisplayName(member)}'s email?`}
        description="They will get no more emails from GHMO and are reached by phone only. Their notes, calls, groups and positions stay. You can add an address again later."
        confirmLabel="Remove email"
        destructive
        busy={busy}
        onConfirm={() => save("")}
      />
    </AdminSectionCard>
  );
}

function EditEmailDialog({
  member,
  current,
  busy,
  canRemove,
  onClose,
  onSave,
  onRemove
}: {
  member: ProfileMember;
  current: string;
  busy: boolean;
  canRemove: boolean;
  onClose: () => void;
  onSave: (email: string) => Promise<void>;
  onRemove: () => void;
}) {
  const [email, setEmail] = useState("");
  const [again, setAgain] = useState("");
  const typed = email.trim();
  const formatProblem = typed && !LOOKS_LIKE_EMAIL.test(typed) ? "Enter a whole email address, like name@example.com." : null;
  // Asking twice catches a typo before mail starts going to a stranger (plan §25.5).
  const mismatch = again.trim() && normalizeMemberEmail(again) !== normalizeMemberEmail(typed) ? "The two addresses don't match." : null;
  const same = typed && typed === current ? "That is already their email address." : null;
  const ready = Boolean(typed) && !formatProblem && !same && normalizeMemberEmail(again) === normalizeMemberEmail(typed);
  const hasEmail = Boolean(current);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (ready) void onSave(typed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{hasEmail ? "Edit email" : "Add email"}: {memberDisplayName(member)}</DialogTitle>
            <DialogDescription>
              {hasEmail ? <>Now: <span className="break-all font-medium text-foreground">{current}</span>. </> : null}
              Their notes, calls, groups and positions stay as they are.
            </DialogDescription>
          </DialogHeader>
          <Field label="New email" error={formatProblem ?? same}>
            <Input type="email" value={email} autoComplete="off" maxLength={320} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Type it again" error={mismatch}>
            <Input type="email" value={again} autoComplete="off" maxLength={320} onChange={e => setAgain(e.target.value)} required />
          </Field>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {member.emailOptOutAt ? <li>They opted out of email, and stay opted out at the new address.</li> : <li>Their email consent stays as it is.</li>}
            {member.emailBounced ? <li>The old address bounced; the new one starts fresh.</li> : null}
            <li>If the new address is on the do-not-email list, it stays off the mailing list.</li>
          </ul>
          {hasEmail && !canRemove ? (
            <Alert>
              <AlertDescription>To remove the email instead, the member first needs a name and a phone number, so they can still be reached.</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="sm:justify-between">
            {hasEmail && canRemove ? (
              <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onRemove}>
                Remove email…
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!ready} title={!ready ? "Type the new address twice." : undefined}>
                Save email
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
