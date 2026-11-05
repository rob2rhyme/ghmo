"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, NotebookPen, Pencil, Plus, UsersRound } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDateTime, formatShortDate, toDate } from "@/src/lib/format";
import { NOTE_MAX, canDeleteNote, checkNoteText, cleanNoteText, memberNoteLoc, type NoteMeta, type NotePayload } from "@/src/lib/memberNotes";
import {
  CITY_MAX,
  FAMILY_NAME_MAX,
  FAMILY_RELATION_MAX,
  MAX_FAMILY,
  STATE_MAX,
  US_STATES,
  checkMemberSince,
  cleanCity,
  contactIsEmpty,
  locationLabel,
  memberSinceLine,
  normalizeFamily,
  normalizeState,
  withFamily
} from "@/src/lib/memberProfile";
import { POSITION_TIME_ZONE, todayIn } from "@/src/lib/positions";
import { formatPhone, maskPhone, memberCallState, memberContactLoc, memberEmailState, newMemberId, type FamilyMember } from "@/src/lib/members";

export type ProfileMember = {
  id: string;
  name?: string | null;
  emailLower?: string;
  status: "active" | "disabled";
  emailConsent?: { source?: string } | null;
  emailOptOutAt?: unknown;
  emailBounced?: boolean;
  hasPhone?: boolean;
  contact?: unknown;
  phoneConsent?: { source?: string } | null;
  callOptOutAt?: unknown;
  groupIds?: string[];
  memberSince?: string | null;
  city?: string | null;
  state?: string | null;
  createdAt?: unknown;
};

async function patchMember(id: string, body: unknown): Promise<ProfileMember> {
  const res = await fetch(`/api/organizations/ghmo/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { member?: ProfileMember; error?: string };
  if (!res.ok || !data.member) throw new Error(data.error || "Something went wrong. Try again.");
  return data.member;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Try again.");

const EMAIL_STATE: Record<string, string> = {
  ready: "Can be emailed",
  no_consent: "No email consent",
  opted_out: "Opted out of email",
  bounced: "Email bounced",
  no_email: "No email (phone only)",
  inactive: "Disabled"
};
const CALL_STATE: Record<string, string> = { ready: "Can be called", no_consent: "No call consent", opted_out: "Asked not to be called", no_phone: "No phone number", inactive: "Disabled" };

export default function MemberProfileClient({
  initialMember,
  groupNames,
  officerTitles,
  me
}: {
  initialMember: ProfileMember;
  groupNames: string[];
  officerTitles: string[];
  /** The signed-in admin: whose notes they may delete (their own, or any for a super admin). */
  me: { uid: string; superAdmin: boolean };
}) {
  const [member, setMember] = useState(initialMember);
  const today = todayIn(new Date(), POSITION_TIME_ZONE);
  const emailState = memberEmailState({ ...member, emailLower: member.emailLower ?? "" });
  const callState = memberCallState(member);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" aria-label="Summary">
        <Badge variant={member.status === "active" ? "success" : "secondary"}>{member.status === "active" ? "Active" : "Disabled"}</Badge>
        <Badge variant="secondary">{EMAIL_STATE[emailState] ?? emailState}</Badge>
        {member.hasPhone ? <Badge variant="secondary">{CALL_STATE[callState] ?? callState}</Badge> : null}
        {officerTitles.map(title => (
          <Badge key={`o-${title}`}>{title}</Badge>
        ))}
        {groupNames.map(name => (
          <Badge key={`g-${name}`} variant="outline">
            {name}
          </Badge>
        ))}
      </div>
      <MembershipCard member={member} today={today} onSaved={setMember} />
      <EncryptionGate what="family details and notes">
        <div className="flex flex-col gap-6">
          <FamilyCard member={member} onSaved={setMember} />
          <NotesCard member={member} me={me} />
        </div>
      </EncryptionGate>
    </div>
  );
}

/** Member since, city and state: plain facts any admin can set (no street address is ever kept). */
function MembershipCard({ member, today, onSaved }: { member: ProfileMember; today: string; onSaved: (member: ProfileMember) => void }) {
  const [since, setSince] = useState(member.memberSince ?? "");
  const [city, setCity] = useState(member.city ?? "");
  const [state, setState] = useState(member.state ?? "");
  const [busy, setBusy] = useState(false);

  const added = toDate(member.createdAt as never);
  const addedDay = added ? todayIn(added, POSITION_TIME_ZONE) : null;
  const sinceProblem = since.trim() ? checkMemberSince(since.trim(), today) : null;
  const changes: Record<string, string | null> = {};
  if (since.trim() !== (member.memberSince ?? "")) changes.memberSince = since.trim() || null;
  if (cleanCity(city) !== (member.city ?? "")) changes.city = cleanCity(city) || null;
  if (normalizeState(state) !== (member.state ?? "")) changes.state = normalizeState(state) || null;
  const dirty = Object.keys(changes).length > 0;
  const place = locationLabel(member.city, member.state);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await patchMember(member.id, changes);
      onSaved(updated);
      setSince(updated.memberSince ?? "");
      setCity(updated.city ?? "");
      setState(updated.state ?? "");
      toast.success("Profile saved");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard title="Membership" description="How long they have been a member, and the city and state they live in. There is no street address.">
      <p className="text-base font-medium" data-testid="member-since-line">
        {member.memberSince ? memberSinceLine(member.memberSince, today) : "No member-since date yet."}
        {place ? <span className="font-normal text-muted-foreground"> · {place}</span> : null}
      </p>
      <form
        className="grid gap-4"
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Member since" error={sinceProblem} description={!since && addedDay ? `Added to the list on ${formatShortDate(addedDay, { timeZone: "UTC" })}.` : undefined}>
            <Input type="date" value={since} onChange={e => setSince(e.target.value)} max={today} />
          </Field>
          <Field label="City">
            <Input value={city} maxLength={CITY_MAX} onChange={e => setCity(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="State">
            <Input value={state} maxLength={STATE_MAX} onChange={e => setState(e.target.value)} list="us-states" autoComplete="off" placeholder="PA" />
          </Field>
        </div>
        <datalist id="us-states">
          {US_STATES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </datalist>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={!dirty || Boolean(sinceProblem)}>
            Save
          </Button>
          {!member.memberSince && addedDay ? (
            <Button type="button" variant="outline" onClick={() => setSince(addedDay)}>
              Use the day they were added
            </Button>
          ) : null}
        </div>
      </form>
    </AdminSectionCard>
  );
}

/** Relatives, kept inside the member's encrypted contact record. Reference only: never contacted or called. */
function FamilyCard({ member, onSaved }: { member: ProfileMember; onSaved: (member: ProfileMember) => void }) {
  const { contacts, ready, remember, e2ee } = useMemberContacts([member]);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const view = contacts.get(member.id);
  const opening = Boolean(member.contact) && !view;
  const blocked = view && !view.ok;
  const contact = view?.ok ? view.contact : {};
  const family = contact.family ?? [];

  const saveFamily = async (next: FamilyMember[]): Promise<boolean> => {
    if (!e2ee.enabled || !ready) {
      toast.error("Unlock this device first.");
      return false;
    }
    if (member.contact && !view?.ok) {
      toast.error("This contact can't be read on this device, so it can't be changed here.");
      return false;
    }
    setBusy(true);
    try {
      const updatedContact = withFamily(contact, next);
      const body = contactIsEmpty(updatedContact) ? { contact: null } : { contact: { enc: await e2ee.encrypt(memberContactLoc(member.id), updatedContact), hasPhone: Boolean(updatedContact.phone) } };
      const updated = await patchMember(member.id, body);
      onSaved(updated);
      remember(member.id, contactIsEmpty(updatedContact) ? null : updatedContact);
      setRevealed(new Set());
      toast.success("Family saved");
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const body = !e2ee.enabled ? (
    <Alert>
      <AlertDescription>Family details are kept encrypted. Turn on encryption (Admin → Encryption) to add them.</AlertDescription>
    </Alert>
  ) : opening ? (
    <p className="text-sm text-muted-foreground">Opening the saved details…</p>
  ) : blocked ? (
    <Alert variant="destructive">
      <AlertDescription>This member&apos;s saved details can&apos;t be opened on this device.</AlertDescription>
    </Alert>
  ) : family.length === 0 ? (
    <EmptyState icon={<UsersRound aria-hidden="true" />} title="No family members listed" description="Add a relative's name, and a phone number if you have one, so a caller knows who else to ask for." />
  ) : (
    <AdminList bare label="Family members">
      {family.map((person, index) => (
        <AdminListRow
          key={`${person.name}-${index}`}
          title={person.name}
          meta={
            <>
              {person.relationship ? <span>{person.relationship}</span> : null}
              {person.phone ? (
                <span className="block font-mono" aria-label={revealed.has(index) ? `Phone ${formatPhone(person.phone)}` : "Phone number hidden"}>
                  {revealed.has(index) ? formatPhone(person.phone) : maskPhone(person.phone)}
                </span>
              ) : null}
            </>
          }
          actions={
            <>
              {person.phone ? (
                <Button
                  size="row"
                  variant="ghost"
                  onClick={() =>
                    setRevealed(current => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                  aria-label={revealed.has(index) ? `Hide ${person.name}'s number` : `Show ${person.name}'s number`}
                >
                  {revealed.has(index) ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  {revealed.has(index) ? "Hide" : "Show"}
                </Button>
              ) : null}
              <Button size="row" variant="outline" onClick={() => setEditing({ index })} aria-label={`Edit ${person.name}`}>
                <Pencil aria-hidden="true" /> Edit
              </Button>
              <Button size="row" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRemoving(index)} aria-label={`Remove ${person.name}`}>
                Remove
              </Button>
            </>
          }
        />
      ))}
    </AdminList>
  );

  return (
    <AdminSectionCard
      title="Family"
      description="Reference only. Family members are never emailed or called by the site, and listing a number does not mean they agreed to be contacted. Kept encrypted; only approved admin devices can read it."
      icon={<UsersRound aria-hidden="true" />}
      actions={
        e2ee.enabled && ready && !blocked && !opening ? (
          <Button variant="outline" size="row" onClick={() => setEditing({ index: null })} disabled={family.length >= MAX_FAMILY} title={family.length >= MAX_FAMILY ? `At most ${MAX_FAMILY} family members` : undefined}>
            <Plus aria-hidden="true" /> Add family member
          </Button>
        ) : undefined
      }
    >
      {body}
      {editing ? (
        <FamilyDialog
          person={editing.index === null ? null : family[editing.index]}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async person => {
            const next = editing.index === null ? [...family, person] : family.map((existing, i) => (i === editing.index ? person : existing));
            const checked = normalizeFamily(next);
            if (!checked.ok) {
              toast.error(checked.error);
              return;
            }
            if (await saveFamily(checked.family)) setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove this family member?"
        description={removing !== null && family[removing] ? `${family[removing].name} is taken off this profile. Nothing else changes.` : ""}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (removing === null) return;
          if (await saveFamily(family.filter((_, i) => i !== removing))) setRemoving(null);
        }}
      />
    </AdminSectionCard>
  );
}

function FamilyDialog({ person, busy, onClose, onSave }: { person: FamilyMember | null; busy: boolean; onClose: () => void; onSave: (person: FamilyMember) => Promise<void> }) {
  const [name, setName] = useState(person?.name ?? "");
  const [relationship, setRelationship] = useState(person?.relationship ?? "");
  const [phone, setPhone] = useState(person?.phone ? formatPhone(person.phone) : "");
  return (
    <Dialog open onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            void onSave({ name, relationship, phone });
          }}
        >
          <DialogHeader>
            <DialogTitle>{person ? "Edit family member" : "Add a family member"}</DialogTitle>
            <DialogDescription>A name is enough. Add how they are related and a phone number if you know it.</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input value={name} maxLength={FAMILY_NAME_MAX} onChange={e => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Relationship (optional)">
            <Input value={relationship} maxLength={FAMILY_RELATION_MAX} onChange={e => setRelationship(e.target.value)} placeholder="Spouse, son, mother…" />
          </Field>
          <Field label="Phone number (optional)" description="10 digits for US numbers, or +country code for others.">
            <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type StoredNote = NoteMeta & { enc: unknown };

/**
 * The notes log: add a note, read them newest first with who wrote each and when. The text is encrypted in this
 * browser, so it needs an unlocked device. Notes can't be edited; their author or a super admin can delete one.
 */
function NotesCard({ member, me }: { member: ProfileMember; me: { uid: string; superAdmin: boolean } }) {
  const e2ee = useE2ee();
  const ready = e2ee.enabled && e2ee.status === "unlocked";
  const [notes, setNotes] = useState<StoredNote[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [texts, setTexts] = useState<Map<string, string | null>>(() => new Map());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<StoredNote | null>(null);

  // Fetch the notes (still encrypted) on open and again after an add or delete.
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload(count => count + 1), []);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/organizations/ghmo/members/${member.id}/notes`, { cache: "no-store" })
      .then(async res => {
        const data = (await res.json().catch(() => ({}))) as { notes?: StoredNote[]; error?: string };
        if (!res.ok || !data.notes) throw new Error(data.error || "Could not load the notes");
        if (cancelled) return;
        setNotes(data.notes);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [member.id, reload]);

  // Lock or sign-out: forget the plaintext so nothing shows until the next unlock.
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) {
    setWasReady(ready);
    if (!ready) setTexts(new Map());
  }

  // Open each note on this device once it is unlocked.
  const { decrypt } = e2ee;
  useEffect(() => {
    if (!ready || !notes) return;
    const pending = notes.filter(note => !texts.has(note.id));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        pending.map(async note => {
          try {
            return [note.id, (await decrypt<NotePayload>(note.enc, memberNoteLoc(member.id, note.id))).text] as const;
          } catch {
            return [note.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      setTexts(current => {
        const next = new Map(current);
        for (const [id, text] of entries) next.set(id, text);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, notes, texts, decrypt, member.id]);

  const problem = draft.trim() ? checkNoteText(draft) : null;

  const add = async () => {
    const text = cleanNoteText(draft);
    const invalid = checkNoteText(text);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    if (!ready) {
      toast.error("Unlock this device first.");
      return;
    }
    setBusy(true);
    try {
      const id = newMemberId();
      const enc = await e2ee.encrypt(memberNoteLoc(member.id, id), { text } satisfies NotePayload);
      const res = await fetch(`/api/organizations/ghmo/members/${member.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enc }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save the note");
      setTexts(current => new Map(current).set(id, text));
      setDraft("");
      refresh();
      toast.success("Note added");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: StoredNote) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/organizations/ghmo/members/${member.id}/notes/${note.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete the note");
      setDeleting(null);
      refresh();
      toast.success("Note deleted");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      title="Notes"
      description="Write what happened or what you were told. Notes are encrypted, carry your name and the date, and can't be edited. You can delete your own; a super admin can delete any."
      icon={<NotebookPen aria-hidden="true" />}
    >
      {!e2ee.enabled ? (
        <Alert>
          <AlertDescription>Notes are kept encrypted. Turn on encryption (Admin → Encryption) to add them.</AlertDescription>
        </Alert>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={event => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label="Add a note" error={problem}>
            <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={!draft.trim() || Boolean(problem) || !ready}>
              Add note
            </Button>
            <span className="text-sm text-muted-foreground">
              {cleanNoteText(draft).length} of {NOTE_MAX}
            </span>
          </div>
        </form>
      )}
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : !notes ? (
        <Skeleton className="h-16 w-full" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<NotebookPen aria-hidden="true" />} title="No notes yet" description="Notes you add show here with your name and the date." />
      ) : (
        <AdminList bare label="Notes">
          {notes.map(note => {
            const text = texts.get(note.id);
            return (
              <AdminListRow
                key={note.id}
                stacked
                title={
                  !ready ? (
                    <span className="text-muted-foreground">Unlock this device to read the note</span>
                  ) : text === undefined ? (
                    <span className="text-muted-foreground">Opening…</span>
                  ) : text === null ? (
                    <span className="text-destructive">This note can&apos;t be opened on this device.</span>
                  ) : (
                    <span className="whitespace-pre-line break-words font-normal">{text}</span>
                  )
                }
                meta={`${note.authorName || "An admin"} · ${note.createdAt ? formatDateTime(note.createdAt, { timeZone: POSITION_TIME_ZONE }) : "no date"}`}
                actions={
                  canDeleteNote(note, me) ? (
                    <Button size="row" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(note)} aria-label={`Delete the note from ${note.authorName || "an admin"}`}>
                      Delete
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </AdminList>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={open => !open && setDeleting(null)}
        title="Delete this note?"
        description="It is removed for everyone and can't be brought back."
        confirmLabel="Delete note"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
    </AdminSectionCard>
  );
}
