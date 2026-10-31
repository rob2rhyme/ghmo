"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Phone, ShieldOff, Upload, UserPlus, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { UnlockCard } from "@/src/components/admin/encryption/UnlockCard";
import { useMemberContacts, type ContactView } from "@/src/components/admin/members/useMemberContacts";
import type { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import {
  CONTACT_LIMITS,
  EMAIL_CONSENT_LABELS,
  MAX_IMPORT_ROWS,
  formatPhone,
  isEmailConsentSource,
  maskPhone,
  memberCallState,
  memberContactLoc,
  memberEmailState,
  newMemberId,
  normalizeContact,
  parseMemberCsv,
  type MemberCallState,
  type MemberContact,
  type MemberEmailState
} from "@/src/lib/members";

export type MemberRow = {
  id: string;
  email?: string;
  emailLower: string;
  name?: string | null;
  status: "active" | "disabled";
  emailConsent?: { at?: unknown; source?: string } | null;
  emailOptOutAt?: unknown;
  emailBounced?: boolean;
  /** Plaintext flag beside the encrypted contact (plan §12, 9-A). */
  hasPhone?: boolean;
  /** The encrypted contact envelope; only an unlocked admin device can read it. */
  contact?: unknown;
  phoneConsent?: { at?: unknown; source?: string } | null;
  callOptOutAt?: unknown;
};

const STATE_LABEL: Record<MemberEmailState, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  ready: { label: "Can be emailed", variant: "success" },
  no_consent: { label: "No consent recorded", variant: "warning" },
  opted_out: { label: "Opted out", variant: "destructive" },
  bounced: { label: "Address bounced", variant: "destructive" },
  inactive: { label: "Disabled", variant: "secondary" }
};

const CALL_LABEL: Partial<Record<MemberCallState, { label: string; variant: "success" | "warning" | "destructive" }>> = {
  ready: { label: "Can be called", variant: "success" },
  no_consent: { label: "No call consent", variant: "warning" },
  opted_out: { label: "Asked not to be called", variant: "destructive" }
};

type Filter = "all" | MemberEmailState | "has_phone";

async function call<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function MembersClient({ initialMembers }: { initialMembers: MemberRow[] }) {
  const [members, setMembers] = useState(initialMembers);
  const { contacts, ready: phonesReady, remember: rememberContact, e2ee } = useMemberContacts(members);
  const { encrypt } = e2ee;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<MemberRow | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [callAgreed, setCallAgreed] = useState(false);
  const [adding, setAdding] = useState(false);

  const [csv, setCsv] = useState("");
  const [attested, setAttested] = useState(false);
  const [phoneAttested, setPhoneAttested] = useState(false);
  const [importing, setImporting] = useState(false);
  const preview = useMemo(() => (csv.trim() ? parseMemberCsv(csv) : null), [csv]);
  const previewPhones = preview?.rows.filter(row => row.phone).length ?? 0;

  // Lock or sign-out: the hook forgets the plaintext; the revealed set goes with it.
  const [wasReady, setWasReady] = useState(phonesReady);
  if (wasReady !== phonesReady) {
    setWasReady(phonesReady);
    if (!phonesReady) setRevealed(new Set());
  }

  const counts = useMemo(() => {
    const result: Record<MemberEmailState, number> & { has_phone: number } = { ready: 0, no_consent: 0, opted_out: 0, bounced: 0, inactive: 0, has_phone: 0 };
    for (const member of members) {
      result[memberEmailState(member)] += 1;
      if (member.hasPhone) result.has_phone += 1;
    }
    return result;
  }, [members]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter(member => {
      if (filter === "has_phone" && !member.hasPhone) return false;
      if (filter !== "all" && filter !== "has_phone" && memberEmailState(member) !== filter) return false;
      if (!needle) return true;
      return member.emailLower.includes(needle) || (member.name ?? "").toLowerCase().includes(needle);
    });
  }, [members, query, filter]);

  const replace = (updated: MemberRow) => setMembers(list => list.map(m => (m.id === updated.id ? updated : m)));

  const refresh = async () => {
    const res = await fetch("/api/organizations/ghmo/members", { cache: "no-store" });
    if (res.ok) setMembers(((await res.json()) as { members: MemberRow[] }).members);
  };

  /** Encrypts a contact for a member id in this browser; the server only ever sees the envelope. */
  const sealContact = async (id: string, contact: MemberContact, hasPhone: boolean) => ({
    enc: await encrypt(memberContactLoc(id), contact),
    hasPhone
  });

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    try {
      const body: Record<string, unknown> = { email, name: name || null };
      if (agreed) body.emailConsent = { source: "admin_on_request" };
      let sealed: MemberContact | null = null;
      if (phone.trim()) {
        if (!phonesReady) throw new Error("Unlock this device before adding a phone number.");
        const { contact, hasPhone, problems } = normalizeContact({ phone });
        if (problems.length) throw new Error(problems[0]);
        const id = newMemberId();
        body.id = id;
        body.contact = await sealContact(id, contact, hasPhone);
        if (callAgreed) body.phoneConsent = { source: "admin_on_request" };
        sealed = contact;
      }
      const { member } = await call<{ member: MemberRow }>("/api/organizations/ghmo/members", "POST", body);
      setMembers(list => [...list, member].sort((a, b) => a.emailLower.localeCompare(b.emailLower)));
      if (sealed) rememberContact(member.id, sealed);
      setEmail("");
      setName("");
      setPhone("");
      setAgreed(false);
      setCallAgreed(false);
      toast.success("Member added");
    } catch (error) {
      toast.error(errorText(error, "Could not add member"));
    } finally {
      setAdding(false);
    }
  };

  const update = async (member: MemberRow, patch: Record<string, unknown>, message: string) => {
    setBusyId(member.id);
    try {
      const { member: updated } = await call<{ member: MemberRow }>(`/api/organizations/ghmo/members/${member.id}`, "PATCH", patch);
      replace(updated);
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(errorText(error, "Could not save"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const saveContact = async (member: MemberRow, form: Record<keyof MemberContact, string>) => {
    const { contact, hasPhone, problems } = normalizeContact(form);
    if (problems.length) {
      toast.error(problems[0]);
      return false;
    }
    const empty = Object.keys(contact).length === 0;
    const patch = empty ? { contact: null } : { contact: await sealContact(member.id, contact, hasPhone) };
    const saved = await update(member, patch, empty ? "Contact removed" : "Contact saved");
    if (saved) rememberContact(member.id, empty ? null : contact);
    return saved;
  };

  const runImport = async () => {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    try {
      if (previewPhones > 0 && !phonesReady) throw new Error("Unlock this device before importing phone numbers.");
      const rows = await Promise.all(
        preview.rows.map(async row => {
          if (!row.phone) return { email: row.email, name: row.name };
          const id = newMemberId();
          return { email: row.email, name: row.name, id, contact: await sealContact(id, { phone: row.phone }, true) };
        })
      );
      const { created, skipped, withPhone } = await call<{ created: number; skipped: number; withPhone: number }>("/api/organizations/ghmo/members/import", "POST", {
        rows,
        attested: true,
        ...(previewPhones > 0 ? { phoneAttested: true } : {})
      });
      toast.success(`${created} added${withPhone ? ` (${withPhone} with a phone number)` : ""}${skipped ? `, ${skipped} already on the list` : ""}`);
      setCsv("");
      setAttested(false);
      setPhoneAttested(false);
      await refresh();
    } catch (error) {
      toast.error(errorText(error, "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  const toggleReveal = (id: string) =>
    setRevealed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: members.length },
    { key: "ready", label: "Can be emailed", count: counts.ready },
    { key: "no_consent", label: "No consent", count: counts.no_consent },
    { key: "opted_out", label: "Opted out", count: counts.opted_out },
    { key: "bounced", label: "Bounced", count: counts.bounced },
    { key: "inactive", label: "Disabled", count: counts.inactive },
    { key: "has_phone", label: "With phone", count: counts.has_phone }
  ];

  const importBlocked = previewPhones > 0 && !phonesReady;

  return (
    <div className="space-y-6">
      <PhoneAccessNotice status={e2ee.status} enabled={e2ee.enabled} superAdmin={Boolean(e2ee.overview?.me.superAdmin)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden="true" className="size-5" /> Add a member
            </CardTitle>
            <CardDescription>Only tick a box if this person told you so. Phone numbers are encrypted in this browser before they are saved.</CardDescription>
          </CardHeader>
          <form onSubmit={addMember} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Name (optional)</Label>
              <Input id="member-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-phone">Phone (optional)</Label>
              <Input
                id="member-phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={32}
                autoComplete="off"
                disabled={!phonesReady}
                placeholder={phonesReady ? "(717) 555-0100" : "Unlock this device to add a number"}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>This person asked to receive email from us.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={callAgreed} disabled={!phonesReady || !phone.trim()} onChange={e => setCallAgreed(e.target.checked)} />
              <span>This person gave their number for community calls.</span>
            </label>
            <Button type="submit" loading={adding}>
              Add member
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload aria-hidden="true" className="size-5" /> Import a list
            </CardTitle>
            <CardDescription>
              Paste a list with one email per line, or a CSV with an <code>email</code> column and optional <code>name</code> and <code>phone</code> columns (up to{" "}
              {MAX_IMPORT_ROWS} at a time). People already on the list are left alone, so an import never re-subscribes someone who opted out. Numbers are
              encrypted here before anything is sent.
            </CardDescription>
          </CardHeader>
          <div className="space-y-3">
            <Label htmlFor="member-csv" className="sr-only">
              Member list
            </Label>
            <Textarea id="member-csv" rows={6} value={csv} onChange={e => setCsv(e.target.value)} placeholder={"email,name,phone\nsam@example.org,Sam Lee,717-555-0100"} />
            {preview ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
                <p className="font-medium">
                  {preview.rows.length} valid {preview.rows.length === 1 ? "address" : "addresses"} found.
                  {previewPhones > 0 ? ` ${previewPhones} with a phone number.` : ""}
                </p>
                {preview.truncated ? <p className="text-warning">Only the first {MAX_IMPORT_ROWS} will be imported.</p> : null}
                {importBlocked ? <p className="text-warning">Unlock this device to import the phone numbers, or remove the phone column.</p> : null}
                {preview.problems.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {preview.problems.slice(0, 5).map(problem => (
                      <li key={problem}>{problem}</li>
                    ))}
                    {preview.problems.length > 5 ? <li>…and {preview.problems.length - 5} more.</li> : null}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={attested} onChange={e => setAttested(e.target.checked)} />
              <span>These people agreed to receive email from us. (This is recorded with your name.)</span>
            </label>
            {previewPhones > 0 ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={phoneAttested} onChange={e => setPhoneAttested(e.target.checked)} />
                <span>These people gave their number for community calls. (Also recorded with your name.)</span>
              </label>
            ) : null}
            <Button
              onClick={runImport}
              loading={importing}
              disabled={!attested || !preview || preview.rows.length === 0 || importBlocked || (previewPhones > 0 && !phoneAttested)}
            >
              Import {preview?.rows.length ? `${preview.rows.length} ` : ""}members
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-5" /> Member list
          </CardTitle>
          <CardDescription>
            {counts.ready} of {members.length} can be emailed. {counts.has_phone} {counts.has_phone === 1 ? "has" : "have"} a phone number.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input aria-label="Search members" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} className="sm:max-w-xs" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter members">
              {filters.map(item => (
                <Button key={item.key} size="sm" variant={filter === item.key ? "default" : "outline"} onClick={() => setFilter(item.key)} aria-pressed={filter === item.key}>
                  {item.label} ({item.count})
                </Button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<Mail aria-hidden="true" />}
              title={members.length === 0 ? "No members yet" : "No one matches"}
              description={members.length === 0 ? "Add someone above or import a list." : "Try another search or filter."}
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {visible.map(member => {
                const state = memberEmailState(member);
                const meta = STATE_LABEL[state];
                const source = member.emailConsent?.source;
                const busy = busyId === member.id;
                const callState = memberCallState(member);
                const callMeta = CALL_LABEL[callState];
                const view = contacts.get(member.id);
                const displayName = member.name || member.emailLower;
                return (
                  <li key={member.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{displayName}</p>
                      {member.name ? <p className="truncate text-sm text-muted-foreground">{member.emailLower}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {isEmailConsentSource(source) ? <span className="text-xs text-muted-foreground">{EMAIL_CONSENT_LABELS[source]}</span> : null}
                        {member.hasPhone && callMeta ? <Badge variant={callMeta.variant}>{callMeta.label}</Badge> : null}
                      </div>
                      {member.hasPhone ? (
                        <PhoneLine
                          name={displayName}
                          ready={phonesReady}
                          view={view}
                          revealed={revealed.has(member.id)}
                          onToggle={() => toggleReveal(member.id)}
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {state === "no_consent" || state === "opted_out" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy}
                          onClick={() => update(member, { emailConsent: { source: "admin_on_request" } }, "Consent recorded")}
                        >
                          {state === "opted_out" ? "They asked to be added back" : "Record consent"}
                        </Button>
                      ) : null}
                      {state === "ready" ? (
                        <Button size="sm" variant="outline" loading={busy} onClick={() => update(member, { emailOptOut: true }, "Opt-out recorded")}>
                          They asked to stop
                        </Button>
                      ) : null}
                      {member.hasPhone && (callState === "no_consent" || callState === "opted_out") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy}
                          onClick={() => update(member, { phoneConsent: { source: "admin_on_request" } }, "Call consent recorded")}
                        >
                          {callState === "opted_out" ? "They asked to be called again" : "Record call consent"}
                        </Button>
                      ) : null}
                      {callState === "ready" ? (
                        <Button size="sm" variant="outline" loading={busy} onClick={() => update(member, { callOptOut: true }, "Call opt-out recorded")}>
                          They asked not to be called
                        </Button>
                      ) : null}
                      {phonesReady ? (
                        <Button size="sm" variant="outline" loading={busy} onClick={() => setEditing(member)} aria-label={`Edit contact for ${displayName}`}>
                          {member.hasPhone || member.contact ? "Edit contact" : "Add phone"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy}
                        onClick={() => update(member, { status: member.status === "active" ? "disabled" : "active" }, member.status === "active" ? "Member disabled" : "Member enabled")}
                      >
                        {member.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {editing ? (
        <ContactDialog
          member={editing}
          initial={contacts.get(editing.id)}
          onClose={() => setEditing(null)}
          onSave={async form => {
            const saved = await saveContact(editing, form);
            if (saved) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Why phone numbers can or cannot be handled right now, with the way to fix it. */
function PhoneAccessNotice({ status, enabled, superAdmin }: { status: ReturnType<typeof useE2ee>["status"]; enabled: boolean; superAdmin: boolean }) {
  if (status === "loading" || status === "error") return null;
  if (!enabled) {
    return (
      <Alert variant="warning">
        <ShieldOff />
        <AlertTitle>Phone numbers need end-to-end encryption, which is not on yet</AlertTitle>
        <AlertDescription>
          Email works as before. Numbers can only be stored once encryption is on, so the server never sees them.{" "}
          {superAdmin ? (
            <Link href="/admin/encryption" className="font-semibold underline">
              Turn on encryption
            </Link>
          ) : (
            "A super admin can turn it on under Admin → Encryption."
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "unlocked") return null;
  if (status === "locked") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="info">
          <Lock />
          <AlertTitle>Phone numbers are end-to-end encrypted</AlertTitle>
          <AlertDescription>Unlock this device to see, add or change them. Everything else on this page works now.</AlertDescription>
        </Alert>
        <UnlockCard />
      </div>
    );
  }
  return (
    <Alert variant="info">
      <Lock />
      <AlertTitle>Phone numbers are end-to-end encrypted</AlertTitle>
      <AlertDescription>
        {status === "pending" ? "This device is waiting for another admin to approve it." : "This device has no encryption keys yet."}{" "}
        <Link href="/admin/encryption" className="font-semibold underline">
          Open Encryption
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function PhoneLine({ name, ready, view, revealed, onToggle }: { name: string; ready: boolean; view: ContactView | undefined; revealed: boolean; onToggle: () => void }) {
  if (!ready) {
    return (
      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
        <Phone aria-hidden="true" className="size-3.5" /> Phone number on file (unlock to view)
      </p>
    );
  }
  if (!view) return <p className="mt-1 text-sm text-muted-foreground">Decrypting…</p>;
  if (!view.ok) return <p className="mt-1 text-sm text-destructive">Phone number can&apos;t be read on this device: {view.error}</p>;
  const { phone, altPhone, language, household } = view.contact;
  if (!phone) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 font-mono" aria-label={revealed ? `Phone ${formatPhone(phone)}` : "Phone number hidden"}>
        <Phone aria-hidden="true" className="size-3.5" />
        {revealed ? formatPhone(phone) : maskPhone(phone)}
      </span>
      <Button size="sm" variant="ghost" onClick={onToggle} aria-label={revealed ? `Hide ${name}'s number` : `Show ${name}'s number`}>
        {revealed ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        {revealed ? "Hide" : "Show"}
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`tel:${phone}`} aria-label={`Call ${name}`}>
          Call
        </a>
      </Button>
      {altPhone && revealed ? <span className="text-muted-foreground">alt {formatPhone(altPhone)}</span> : null}
      {language ? <span className="text-muted-foreground">{language}</span> : null}
      {household ? <span className="text-muted-foreground">· {household}</span> : null}
    </div>
  );
}

const EMPTY_FORM: Record<keyof MemberContact, string> = { phone: "", altPhone: "", language: "", household: "", notes: "" };

function ContactDialog({
  member,
  initial,
  onClose,
  onSave
}: {
  member: MemberRow;
  initial: ContactView | undefined;
  onClose: () => void;
  onSave: (form: Record<keyof MemberContact, string>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<keyof MemberContact, string>>(() => {
    if (!initial?.ok) return EMPTY_FORM;
    const c = initial.contact;
    return { phone: c.phone ?? "", altPhone: c.altPhone ?? "", language: c.language ?? "", household: c.household ?? "", notes: c.notes ?? "" };
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof MemberContact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };
  const unreadable = initial !== undefined && !initial.ok;
  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : null)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Contact for {member.name || member.emailLower}</DialogTitle>
            <DialogDescription>Encrypted in this browser. Only BOD devices with encryption keys can read it; the server never can.</DialogDescription>
          </DialogHeader>
          {unreadable ? (
            <Alert variant="warning">
              <ShieldOff />
              <AlertTitle>The saved contact can&apos;t be read on this device</AlertTitle>
              <AlertDescription>Saving will replace it with what you enter here.</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input id="contact-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={32} autoComplete="off" placeholder="(717) 555-0100" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-alt">Second phone (optional)</Label>
            <Input id="contact-alt" type="tel" value={form.altPhone} onChange={set("altPhone")} maxLength={32} autoComplete="off" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-language">Preferred language (optional)</Label>
              <Input id="contact-language" value={form.language} onChange={set("language")} maxLength={CONTACT_LIMITS.language} autoComplete="off" placeholder="Nepali, English…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-household">Household (optional)</Label>
              <Input id="contact-household" value={form.household} onChange={set("household")} maxLength={CONTACT_LIMITS.household} autoComplete="off" placeholder="People who share this phone" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-notes">Notes (optional)</Label>
            <Textarea id="contact-notes" rows={3} value={form.notes} onChange={set("notes")} maxLength={CONTACT_LIMITS.notes} placeholder="Best time to call, who to ask for…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
