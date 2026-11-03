"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Phone, SearchX, ShieldOff, Upload, UserPlus } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Segmented } from "@/src/components/ui/segmented";
import { Select } from "@/src/components/ui/select";
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
  // Neutral, not a warning: on day one nobody has been asked yet, and that is normal.
  no_consent: { label: "No consent recorded", variant: "secondary" },
  opted_out: { label: "Opted out", variant: "destructive" },
  bounced: { label: "Address bounced", variant: "destructive" },
  inactive: { label: "Disabled", variant: "secondary" }
};

const CALL_LABEL: Partial<Record<MemberCallState, { label: string; variant: "success" | "secondary" | "destructive" }>> = {
  ready: { label: "Can be called", variant: "success" },
  no_consent: { label: "No call consent", variant: "secondary" },
  opted_out: { label: "Asked not to be called", variant: "destructive" }
};

type Filter = "all" | MemberEmailState | "has_phone";

const SAMPLE_CSV = "email,name,phone\nsam@example.org,Sam Lee,717-555-0100\npat@example.org,Pat Rai,";

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
  const [disabling, setDisabling] = useState<MemberRow | null>(null);
  /** Which form is open above the list, at every width. An empty list starts with the Add form open. */
  const [panel, setPanel] = useState<"add" | "import" | null>(initialMembers.length === 0 ? "add" : null);

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
  const togglePanel = (which: "add" | "import") => setPanel(current => (current === which ? null : which));
  const phoneSentence = phonesReady
    ? "Phone numbers are encrypted in this browser before they are saved."
    : !e2ee.enabled
      ? "Phone numbers can be added once encryption is on."
      : "Unlock this device to add a phone number.";

  return (
    <div className="flex flex-col gap-6">
      <PhoneAccessNotice status={e2ee.status} enabled={e2ee.enabled} superAdmin={Boolean(e2ee.overview?.me.superAdmin)} />

      {/* The list comes first at every width; adding and importing open from these two buttons. */}
      <div className="flex flex-wrap gap-2">
        <Button variant={panel === "add" ? "secondary" : "outline"} size="row" aria-expanded={panel === "add"} aria-controls="member-add-panel" onClick={() => togglePanel("add")}>
          <UserPlus aria-hidden="true" /> Add a member
        </Button>
        <Button
          variant={panel === "import" ? "secondary" : "outline"}
          size="row"
          aria-expanded={panel === "import"}
          aria-controls="member-import-panel"
          onClick={() => togglePanel("import")}
        >
          <Upload aria-hidden="true" /> Import a list
        </Button>
      </div>

      {panel === "add" ? (
        <div id="member-add-panel" className="min-w-0">
          <AdminSectionCard title="Add a member" description={`Only check a box if this person told you so. ${phoneSentence}`}>
            <form onSubmit={addMember} className="flex flex-col gap-4">
              <Field label="Email">
                <Input id="member-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.org" />
              </Field>
              <Field label="Name (optional)">
                <Input id="member-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="off" />
              </Field>
              <Field
                label="Phone (optional)"
                description={<PhoneFieldHint status={e2ee.status} enabled={e2ee.enabled} ready={phonesReady} superAdmin={Boolean(e2ee.overview?.me.superAdmin)} />}
              >
                <Input
                  id="member-phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  maxLength={32}
                  autoComplete="off"
                  disabled={!phonesReady}
                  placeholder={phonesReady ? "(717) 555-0100" : undefined}
                />
              </Field>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                  <span>This person asked to receive email from us.</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={callAgreed}
                    disabled={!phonesReady || !phone.trim()}
                    onChange={e => setCallAgreed(e.target.checked)}
                  />
                  <span>This person gave their number for community calls.</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={adding} className="max-sm:h-11">
                  Add member
                </Button>
              </div>
            </form>
          </AdminSectionCard>
        </div>
      ) : null}

      {panel === "import" ? (
        <div id="member-import-panel" className="min-w-0">
          <AdminSectionCard title="Import a list" description="Add many people at once from a spreadsheet or an email list.">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Paste one email per line, or comma-separated rows (CSV) with the columns email, name and phone. Name and phone are optional. Up to {MAX_IMPORT_ROWS} at a
                time.
              </li>
              <li>People already on the list are left alone, so an import never signs up again someone who opted out.</li>
              <li>{phonesReady ? "Phone numbers are encrypted on this device before anything is sent." : !e2ee.enabled ? "Phone numbers can be imported once encryption is on." : "Unlock this device to import phone numbers."}</li>
            </ul>
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="text-muted-foreground">Example (the first line names the columns):</p>
              <pre className="overflow-x-auto font-mono text-xs text-foreground">{SAMPLE_CSV}</pre>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV + "\n")}`}
                download="members-example.csv"
                className="inline-flex min-h-11 w-fit items-center font-medium text-foreground underline underline-offset-2 sm:min-h-0"
              >
                Download the example spreadsheet (CSV)
              </a>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Paste your list">
                <Textarea id="member-csv" rows={6} value={csv} onChange={e => setCsv(e.target.value)} placeholder={"email,name,phone\nsam@example.org,Sam Lee,717-555-0100"} />
              </Field>
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
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={attested} onChange={e => setAttested(e.target.checked)} />
                <span>These people agreed to receive email from us. (This is recorded with your name.)</span>
              </label>
              {previewPhones > 0 ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={phoneAttested} onChange={e => setPhoneAttested(e.target.checked)} />
                  <span>These people gave their number for community calls. (Also recorded with your name.)</span>
                </label>
              ) : null}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={runImport}
                    loading={importing}
                    disabled={!attested || !preview || preview.rows.length === 0 || importBlocked || (previewPhones > 0 && !phoneAttested)}
                    className="max-sm:h-11"
                  >
                    Import {preview?.rows.length ? `${preview.rows.length} ` : ""}members
                  </Button>
                </div>
                {!preview || preview.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Paste a list above to see how many people will be added.</p>
                ) : !attested ? (
                  <p className="text-sm text-muted-foreground">Check the box above to confirm these people agreed.</p>
                ) : previewPhones > 0 && !phoneAttested && !importBlocked ? (
                  <p className="text-sm text-muted-foreground">Check the call box too, or remove the phone column.</p>
                ) : null}
              </div>
            </div>
          </AdminSectionCard>
        </div>
      ) : null}

      <AdminSectionCard
        title="Member list"
        description={`${counts.ready} of ${members.length} can be emailed. ${counts.has_phone} ${counts.has_phone === 1 ? "has" : "have"} a phone number.`}
      >
        <div className="flex flex-col gap-3">
          <Input aria-label="Search members" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)} className="max-lg:h-11 md:max-w-xs" />
          <div className="lg:hidden">
            <Select aria-label="Filter members" value={filter} onChange={e => setFilter(e.target.value as Filter)} className="h-11">
              {filters.map(item => (
                <option key={item.key} value={item.key}>
                  {item.label} ({item.count})
                </option>
              ))}
            </Select>
          </div>
          <Segmented
            className="hidden lg:flex"
            label="Filter members"
            value={filter}
            onChange={setFilter}
            options={filters.map(item => ({ value: item.key, label: item.label, count: item.count }))}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={members.length === 0 ? <Mail aria-hidden="true" /> : <SearchX aria-hidden="true" />}
            title={members.length === 0 ? "No members yet" : "No one matches"}
            description={
              members.length === 0 ? "Add people one at a time or import a list. Only check consent if the person told you so." : "Try another search, or show everyone."
            }
            action={
              members.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Show everyone
                </Button>
              ) : panel === null ? (
                <Button variant="outline" size="row" onClick={() => setPanel("add")}>
                  <UserPlus aria-hidden="true" /> Add the first member
                </Button>
              ) : null
            }
          />
        ) : (
          <AdminList bare label="Members">
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
                <AdminListRow
                  key={member.id}
                  title={<span className="break-all">{displayName}</span>}
                  meta={member.name ? <span className="break-all">{member.emailLower}</span> : undefined}
                  badges={
                    <>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {isEmailConsentSource(source) ? <span className="text-sm text-muted-foreground">{EMAIL_CONSENT_LABELS[source]}</span> : null}
                      {member.hasPhone && callMeta ? <Badge variant={callMeta.variant}>{callMeta.label}</Badge> : null}
                    </>
                  }
                  actions={
                    <>
                      {state === "no_consent" || state === "opted_out" ? (
                        <Button
                          size="row"
                          variant="outline"
                          loading={busy}
                          onClick={() => update(member, { emailConsent: { source: "admin_on_request" } }, "Consent recorded")}
                        >
                          {state === "opted_out" ? "They asked to be added back" : "Record consent"}
                        </Button>
                      ) : null}
                      {state === "ready" ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => update(member, { emailOptOut: true }, "Opt-out recorded")}>
                          They asked to stop
                        </Button>
                      ) : null}
                      {member.hasPhone && (callState === "no_consent" || callState === "opted_out") ? (
                        <Button
                          size="row"
                          variant="outline"
                          loading={busy}
                          onClick={() => update(member, { phoneConsent: { source: "admin_on_request" } }, "Call consent recorded")}
                        >
                          {callState === "opted_out" ? "They asked to be called again" : "Record call consent"}
                        </Button>
                      ) : null}
                      {callState === "ready" ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => update(member, { callOptOut: true }, "Call opt-out recorded")}>
                          They asked not to be called
                        </Button>
                      ) : null}
                      {phonesReady ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => setEditing(member)} aria-label={`Edit contact for ${displayName}`}>
                          {member.hasPhone || member.contact ? "Edit contact" : "Add phone"}
                        </Button>
                      ) : null}
                      {/* Set apart at the row end: a divider before it, ghost red, and a confirmation. */}
                      <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
                      {member.status === "active" ? (
                        <Button
                          size="row"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          loading={busy}
                          onClick={() => setDisabling(member)}
                        >
                          Disable
                        </Button>
                      ) : (
                        <Button size="row" variant="ghost" loading={busy} onClick={() => update(member, { status: "active" }, "Member enabled")}>
                          Enable
                        </Button>
                      )}
                    </>
                  }
                >
                  {member.hasPhone ? (
                    <PhoneLine name={displayName} ready={phonesReady} view={view} revealed={revealed.has(member.id)} onToggle={() => toggleReveal(member.id)} />
                  ) : null}
                </AdminListRow>
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>

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

      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={open => (!open ? setDisabling(null) : null)}
        destructive
        title={`Disable ${disabling ? disabling.name || disabling.emailLower : "this member"}?`}
        description="They stay on the list but get no broadcasts and are left out of calls until you enable them again."
        confirmLabel="Disable member"
        busy={disabling !== null && busyId === disabling.id}
        onConfirm={async () => {
          if (!disabling) return;
          await update(disabling, { status: "disabled" }, "Member disabled");
          setDisabling(null);
        }}
      />
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
        <AlertTitle>Encryption is off, so phone numbers can&apos;t be added yet</AlertTitle>
        <AlertDescription>
          Email works now. Numbers can be stored once encryption is on, so the server never sees them.{" "}
          {superAdmin ? (
            <Link href="/admin/encryption" className="font-semibold text-foreground underline underline-offset-2">
              Turn on encryption
            </Link>
          ) : (
            "A super admin can turn it on."
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "unlocked") return null;
  if (status === "locked") return <UnlockCard what="phone numbers" detail="Everything else on this page works now." />;
  return (
    <Alert variant="info">
      <Lock />
      <AlertTitle>Set up this device to see phone numbers</AlertTitle>
      <AlertDescription>
        {status === "pending" ? "This device is waiting for another admin to approve it." : "This device has no encryption keys yet."} Everything else on this page
        works now.{" "}
        <Link href="/admin/encryption" className="font-semibold text-foreground underline underline-offset-2">
          Open Encryption
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/** Help under the Phone field: why it is greyed out right now, and what to do about it. */
function PhoneFieldHint({ status, enabled, ready, superAdmin }: { status: ReturnType<typeof useE2ee>["status"]; enabled: boolean; ready: boolean; superAdmin: boolean }) {
  if (ready) return <>Encrypted on this device before it is saved. Check the call box below only if they agreed.</>;
  if (status === "loading") return <>Checking encryption…</>;
  if (!enabled) {
    return (
      <>
        Phone numbers can be added after a super admin turns on encryption.{" "}
        {superAdmin ? (
          <Link href="/admin/encryption" className="font-medium text-primary underline underline-offset-2">
            Turn it on
          </Link>
        ) : null}
      </>
    );
  }
  if (status === "locked") return <>Unlock this device to add a number.</>;
  return (
    <>
      This device can&apos;t add numbers yet.{" "}
      <Link href="/admin/encryption" className="font-medium text-primary underline underline-offset-2">
        Open Encryption
      </Link>
    </>
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
  if (!view) return <p className="mt-1 text-sm text-muted-foreground">Unlocking…</p>;
  if (!view.ok) return <p className="mt-1 text-sm text-destructive">Phone number can&apos;t be opened on this device.</p>;
  const { phone, altPhone, language, household } = view.contact;
  if (!phone) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 font-mono" aria-label={revealed ? `Phone ${formatPhone(phone)}` : "Phone number hidden"}>
        <Phone aria-hidden="true" className="size-3.5" />
        {revealed ? formatPhone(phone) : maskPhone(phone)}
      </span>
      <Button size="row" variant="ghost" onClick={onToggle} aria-label={revealed ? `Hide ${name}'s number` : `Show ${name}'s number`}>
        {revealed ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        {revealed ? "Hide" : "Show"}
      </Button>
      <Button asChild size="row" variant="outline">
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
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Contact for {member.name || member.emailLower}</DialogTitle>
            <DialogDescription>Encrypted in this browser. Only approved admin devices can read it; the server never can.</DialogDescription>
          </DialogHeader>
          {unreadable ? (
            <Alert variant="warning">
              <ShieldOff />
              <AlertTitle>The saved contact can&apos;t be opened on this device</AlertTitle>
              <AlertDescription>Saving will replace it with what you enter here.</AlertDescription>
            </Alert>
          ) : null}
          <Field label="Phone">
            <Input id="contact-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={32} autoComplete="off" placeholder="(717) 555-0100" />
          </Field>
          <Field label="Second phone (optional)">
            <Input id="contact-alt" type="tel" value={form.altPhone} onChange={set("altPhone")} maxLength={32} autoComplete="off" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Preferred language (optional)">
              <Input id="contact-language" value={form.language} onChange={set("language")} maxLength={CONTACT_LIMITS.language} autoComplete="off" placeholder="Nepali, English…" />
            </Field>
            <Field label="Household (optional)">
              <Input id="contact-household" value={form.household} onChange={set("household")} maxLength={CONTACT_LIMITS.household} autoComplete="off" placeholder="People who share this phone" />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Textarea id="contact-notes" rows={3} value={form.notes} onChange={set("notes")} maxLength={CONTACT_LIMITS.notes} placeholder="Best time to call, who to ask for…" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
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
