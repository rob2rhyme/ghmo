"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, UsersRound } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { formatShortDate, toDate } from "@/src/lib/format";
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
import { formatPhone, maskPhone, memberCallState, memberContactLoc, memberEmailState, type FamilyMember } from "@/src/lib/members";

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

export default function MemberProfileClient({ initialMember, groupNames, officerTitles }: { initialMember: ProfileMember; groupNames: string[]; officerTitles: string[] }) {
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
      <EncryptionGate what="family details">
        <FamilyCard member={member} onSaved={setMember} />
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
