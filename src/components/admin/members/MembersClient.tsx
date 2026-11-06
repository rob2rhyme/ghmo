"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Lock, Mail, Pencil, Phone, PhoneCall, PhoneOff, SearchX, ShieldOff, Upload, UserCheck, UserPlus, UserRound, UserX, Users } from "lucide-react";
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
import { SearchInput } from "@/src/components/ui/search-input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { UnlockCard } from "@/src/components/admin/encryption/UnlockCard";
import { useMemberContacts, type ContactView } from "@/src/components/admin/members/useMemberContacts";
import MemberGroupsDialog, { type GroupChoice } from "@/src/components/admin/people/MemberGroupsDialog";
import RenameMemberDialog from "@/src/components/admin/people/RenameMemberDialog";
import ExportMembersDialog, { type ExportChoice } from "@/src/components/admin/members/ExportMembersDialog";
import { exportFileName, membersCsv, type ExportMember } from "@/src/lib/memberExport";
import type { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import {
  CONTACT_LIMITS,
  EMAIL_CONSENT_LABELS,
  MAX_IMPORT_ROWS,
  formatPhone,
  hasEmail,
  isEmailConsentSource,
  maskPhone,
  memberCallState,
  memberContactLoc,
  memberDisplayName,
  memberEmailState,
  newMemberId,
  normalizeContact,
  parseMemberCsv,
  phoneOnlyKey,
  type ContactForm,
  type MemberCallState,
  type MemberContact,
  type MemberEmailState
} from "@/src/lib/members";
import { groupNamesFor } from "@/src/lib/groups";
import { contactIsEmpty, locationLabel, withFamily } from "@/src/lib/memberProfile";

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
  /** Member groups this person is in (plan §15, 11-A); written only by the groups routes. */
  groupIds?: string[];
  /** Profile facts (plan §17): the day they joined, and city and state. */
  memberSince?: string | null;
  city?: string | null;
  state?: string | null;
};

const STATE_LABEL: Record<MemberEmailState, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  ready: { label: "Can be emailed", variant: "success" },
  // Neutral, not a warning: on day one nobody has been asked yet, and that is normal.
  no_consent: { label: "No consent recorded", variant: "secondary" },
  opted_out: { label: "Opted out", variant: "destructive" },
  bounced: { label: "Address bounced", variant: "destructive" },
  // Many members don't use email; they are reached by phone and never emailed.
  no_email: { label: "No email (phone only)", variant: "secondary" },
  inactive: { label: "Turned off", variant: "secondary" }
};

const CALL_LABEL: Partial<Record<MemberCallState, { label: string; variant: "success" | "secondary" | "destructive" }>> = {
  ready: { label: "Can be called", variant: "success" },
  no_consent: { label: "No call consent", variant: "secondary" },
  opted_out: { label: "Asked not to be called", variant: "destructive" }
};

type Filter = "all" | MemberEmailState | "has_phone";
/** The group filter: everyone, officers, people in no group, or one group by id. */
type GroupFilter = "any" | "officers" | "none" | `g:${string}`;

const SAMPLE_CSV = "email,name,phone\nsam@example.org,Sam Lee,717-555-0100\npat@example.org,Pat Rai,\n,Maya Gurung,717-555-0102";

async function call<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export default function MembersClient({
  initialMembers,
  groups = [],
  officers = {},
  superAdmin = false
}: {
  initialMembers: MemberRow[];
  /** Every group, for the filter, the badges and the Groups dialog. */
  groups?: GroupChoice[];
  /** Titles of the positions each member holds today, by member id. */
  officers?: Record<string, string[]>;
  /** Only a super admin may fix a member's name (a typo), so only they get the Edit name button. */
  superAdmin?: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const { contacts, ready: phonesReady, remember: rememberContact, e2ee } = useMemberContacts(members);
  const { encrypt } = e2ee;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("any");
  const [groupsFor, setGroupsFor] = useState<MemberRow | null>(null);
  const [renaming, setRenaming] = useState<MemberRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
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
  const previewEmails = preview?.rows.filter(row => row.email).length ?? 0;
  const previewPhoneOnly = preview?.rows.filter(row => !row.email).length ?? 0;

  /**
   * Phone-only people already on the list, by name and number. Only this browser can read the numbers,
   * so this is where duplicates without an email are caught (the server catches repeated emails).
   */
  const numbersOpened = !members.some(member => member.contact && !contacts.has(member.id));
  const knownPhoneOnly = useMemo(() => {
    const keys = new Set<string>();
    for (const member of members) {
      const view = contacts.get(member.id);
      if (view?.ok && view.contact.phone) keys.add(phoneOnlyKey(view.contact.phone, member.name));
    }
    return keys;
  }, [members, contacts]);

  // Lock or sign-out: the hook forgets the plaintext; the revealed set goes with it.
  const [wasReady, setWasReady] = useState(phonesReady);
  if (wasReady !== phonesReady) {
    setWasReady(phonesReady);
    if (!phonesReady) setRevealed(new Set());
  }

  const counts = useMemo(() => {
    const result: Record<MemberEmailState, number> & { has_phone: number } = { ready: 0, no_consent: 0, opted_out: 0, bounced: 0, no_email: 0, inactive: 0, has_phone: 0 };
    for (const member of members) {
      result[memberEmailState(member)] += 1;
      if (member.hasPhone) result.has_phone += 1;
    }
    return result;
  }, [members]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members
      .filter(member => {
        if (filter === "has_phone" && !member.hasPhone) return false;
        if (filter !== "all" && filter !== "has_phone" && memberEmailState(member) !== filter) return false;
        if (groupFilter === "officers" && !officers[member.id]?.length) return false;
        if (groupFilter === "none" && (member.groupIds?.length ?? 0) > 0) return false;
        if (groupFilter.startsWith("g:") && !(member.groupIds ?? []).includes(groupFilter.slice(2))) return false;
        if (!needle) return true;
        return (
          (member.emailLower ?? "").includes(needle) ||
          (member.name ?? "").toLowerCase().includes(needle) ||
          locationLabel(member.city, member.state).toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
  }, [members, query, filter, groupFilter, officers]);

  const replace = (updated: MemberRow) => setMembers(list => list.map(m => (m.id === updated.id ? updated : m)));

  const refresh = async () => {
    const res = await fetch("/api/organizations/ghmo/members", { cache: "no-store" });
    if (res.ok) setMembers(((await res.json()) as { members: MemberRow[] }).members);
  };

  /**
   * Builds the CSV in this browser and downloads it. The activity log is written first, and the file is made only if that
   * worked, so no download goes unrecorded. Numbers come from contacts this device has already decrypted.
   */
  const downloadExport = async ({ scope, includePhones }: ExportChoice) => {
    setExportBusy(true);
    try {
      const list = scope === "all" ? [...members].sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b))) : visible;
      await call("/api/admin/member-export", "POST", { count: list.length, scope, includesPhones: includePhones });
      const groupName = new Map(groups.map(group => [group.id, group.name]));
      const rows: ExportMember[] = list.map(member => {
        const view = includePhones ? contacts.get(member.id) : undefined;
        return {
          name: member.name ?? "",
          email: member.emailLower ?? "",
          status: member.status,
          memberSince: member.memberSince ?? null,
          city: member.city ?? null,
          state: member.state ?? null,
          groups: (member.groupIds ?? []).map(id => groupName.get(id)).filter((name): name is string => Boolean(name)),
          positions: officers[member.id] ?? [],
          emailState: memberEmailState(member),
          callState: memberCallState(member),
          contact: view?.ok ? view.contact : null
        };
      });
      const blob = new Blob([membersCsv(rows, { includePhones })], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(new Date().toISOString().slice(0, 10));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${rows.length} ${rows.length === 1 ? "member" : "members"}`);
      setExporting(false);
    } catch (error) {
      toast.error(errorText(error, "Could not download the list"));
    } finally {
      setExportBusy(false);
    }
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
      const cleanEmail = email.trim();
      // An email, or a name and a phone number: many members don't use email.
      if (!cleanEmail && !phone.trim()) throw new Error("Add an email address or a phone number.");
      if (!cleanEmail && !name.trim()) throw new Error("Add a name for someone without an email.");
      const body: Record<string, unknown> = { name: name || null };
      if (cleanEmail) body.email = cleanEmail;
      if (agreed && cleanEmail) body.emailConsent = { source: "admin_on_request" };
      let sealed: MemberContact | null = null;
      if (phone.trim()) {
        if (!phonesReady) throw new Error("Unlock this device before adding a phone number.");
        const { contact, hasPhone, problems } = normalizeContact({ phone });
        if (problems.length) throw new Error(problems[0]);
        if (!cleanEmail) {
          if (!numbersOpened) throw new Error("Still opening the saved numbers. Try again in a moment.");
          if (knownPhoneOnly.has(phoneOnlyKey(contact.phone!, name))) throw new Error(`${name.trim()} with this number is already on the list.`);
        }
        const id = newMemberId();
        body.id = id;
        body.contact = await sealContact(id, contact, hasPhone);
        if (callAgreed) body.phoneConsent = { source: "admin_on_request" };
        sealed = contact;
      }
      const { member } = await call<{ member: MemberRow }>("/api/organizations/ghmo/members", "POST", body);
      setMembers(list => [...list, member]);
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

  const saveContact = async (member: MemberRow, form: ContactForm) => {
    // A contact this device couldn't open must not be replaced by the form: that would lose what is in it.
    if (member.contact && !contacts.get(member.id)?.ok) {
      toast.error("This contact can't be read on this device, so it can't be changed here.");
      return false;
    }
    const normalized = normalizeContact(form);
    const { hasPhone, problems } = normalized;
    // The form has no family list, which lives on the profile page, so keep the one already stored instead of erasing it.
    const contact = withFamily(normalized.contact, contacts.get(member.id)?.ok ? (contacts.get(member.id) as { ok: true; contact: MemberContact }).contact.family : undefined);
    if (problems.length) {
      toast.error(problems[0]);
      return false;
    }
    if (!hasEmail(member) && !hasPhone) {
      toast.error("Someone without an email needs a phone number. Turn them off instead if they should no longer be contacted.");
      return false;
    }
    const empty = contactIsEmpty(contact);
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
      if (previewPhoneOnly > 0 && !numbersOpened) throw new Error("Still opening the saved numbers. Try again in a moment.");
      // Phone-only people already on the list (same name and number) are left out here; repeated emails
      // are left out by the server.
      const fresh = preview.rows.filter(row => row.email || !knownPhoneOnly.has(phoneOnlyKey(row.phone!, row.name)));
      const alreadyThere = preview.rows.length - fresh.length;
      if (fresh.length === 0) {
        toast.info(`Everyone on this list is already on the member list (${alreadyThere}).`);
        return;
      }
      const rows = await Promise.all(
        fresh.map(async row => {
          const base = { ...(row.email ? { email: row.email } : {}), name: row.name };
          if (!row.phone) return base;
          const id = newMemberId();
          return { ...base, id, contact: await sealContact(id, { phone: row.phone }, true) };
        })
      );
      const { created, skipped, withPhone } = await call<{ created: number; skipped: number; withPhone: number }>("/api/organizations/ghmo/members/import", "POST", {
        rows,
        ...(fresh.some(row => row.email) ? { attested: true } : {}),
        ...(fresh.some(row => row.phone) ? { phoneAttested: true } : {})
      });
      const onList = skipped + alreadyThere;
      toast.success(`${created} added${withPhone ? ` (${withPhone} with a phone number)` : ""}${onList ? `, ${onList} already on the list` : ""}`);
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
    { key: "no_email", label: "Phone only", count: counts.no_email },
    { key: "inactive", label: "Turned off", count: counts.inactive },
    { key: "has_phone", label: "With phone", count: counts.has_phone }
  ];

  const importBlocked = previewPhones > 0 && !phonesReady;
  const needsEmailAttest = previewEmails > 0;
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
        <Button variant="outline" size="row" disabled={members.length === 0} onClick={() => setExporting(true)} title="Download the member list as a spreadsheet (CSV)">
          <Download aria-hidden="true" /> Export list
        </Button>
      </div>

      {panel === "add" ? (
        <div id="member-add-panel" className="min-w-0">
          <AdminSectionCard title="Add a member" description={`Only check a box if this person told you so. ${phoneSentence}`}>
            <form onSubmit={addMember} className="flex flex-col gap-4">
              <Field label="Email" description="Leave empty if they don't use email. Then a name and a phone number are needed.">
                <Input id="member-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="name@example.org" />
              </Field>
              <Field label="Name" description="Needed when there is no email.">
                <Input id="member-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="off" />
              </Field>
              <Field
                label="Phone"
                description={
                  <>
                    {email.trim() ? "Optional when they have an email." : "Needed when there is no email."}{" "}
                    <PhoneFieldHint status={e2ee.status} enabled={e2ee.enabled} ready={phonesReady} superAdmin={Boolean(e2ee.overview?.me.superAdmin)} />
                  </>
                }
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
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={agreed && Boolean(email.trim())}
                    disabled={!email.trim()}
                    onChange={e => setAgreed(e.target.checked)}
                  />
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
                Paste comma-separated rows (CSV) with the columns email, name and phone, or one email per line. Leave the email empty for someone who doesn&apos;t
                use email: they then need a name and a phone number. Up to {MAX_IMPORT_ROWS} at a time.
              </li>
              <li>
                People already on the list are left alone, so an import never signs up again someone who opted out. Without an email, the same name and number counts as
                the same person.
              </li>
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
                    {preview.rows.length} {preview.rows.length === 1 ? "person" : "people"} found.
                    {previewPhones > 0 ? ` ${previewPhones} with a phone number.` : ""}
                    {previewPhoneOnly > 0 ? ` ${previewPhoneOnly} without an email.` : ""}
                  </p>
                  {preview.truncated ? <p className="text-warning">Only the first {MAX_IMPORT_ROWS} will be imported.</p> : null}
                  {importBlocked ? (
                    <p className="text-warning">
                      {previewPhoneOnly > 0
                        ? "Unlock this device to import phone numbers. People without an email can only be added with their number."
                        : "Unlock this device to import the phone numbers, or remove the phone column."}
                    </p>
                  ) : null}
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
              {needsEmailAttest || !preview ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={attested} onChange={e => setAttested(e.target.checked)} />
                  <span>
                    {previewPhoneOnly > 0 ? "The people with an email agreed to receive email from us." : "These people agreed to receive email from us."} (This is recorded with
                    your name.)
                  </span>
                </label>
              ) : null}
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
                    disabled={(needsEmailAttest && !attested) || !preview || preview.rows.length === 0 || importBlocked || (previewPhones > 0 && !phoneAttested)}
                    className="max-sm:h-11"
                  >
                    Import {preview?.rows.length ? `${preview.rows.length} ` : ""}members
                  </Button>
                </div>
                {!preview || preview.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Paste a list above to see how many people will be added.</p>
                ) : needsEmailAttest && !attested ? (
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
        description={`${counts.ready} of ${members.length} can be emailed. ${counts.has_phone} ${counts.has_phone === 1 ? "has" : "have"} a phone number${counts.no_email ? `, ${counts.no_email} of them with no email` : ""}.`}
      >
        <div className="flex flex-col gap-3">
          <SearchInput aria-label="Search members" placeholder="Search by name, email or city" value={query} onChange={setQuery} className="md:max-w-xs" inputClassName="max-lg:h-11" />
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
          {groups.length > 0 || Object.keys(officers).length > 0 ? (
            <Select aria-label="Filter by group" value={groupFilter} onChange={e => setGroupFilter(e.target.value as GroupFilter)} className="max-lg:h-11 md:max-w-xs">
              <option value="any">Any group</option>
              <option value="officers">Officers (hold a position)</option>
              {groups.map(group => (
                <option key={group.id} value={`g:${group.id}`}>
                  {group.name}
                </option>
              ))}
              <option value="none">In no group</option>
            </Select>
          ) : null}
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
                    setGroupFilter("any");
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
              const displayName = memberDisplayName(member);
              return (
                <AdminListRow
                  key={member.id}
                  title={<span className="break-all">{displayName}</span>}
                  meta={
                    member.name && hasEmail(member) ? (
                      <span className="break-all">
                        {member.emailLower}
                        {locationLabel(member.city, member.state) ? ` · ${locationLabel(member.city, member.state)}` : ""}
                      </span>
                    ) : locationLabel(member.city, member.state) ? (
                      <span>{locationLabel(member.city, member.state)}</span>
                    ) : undefined
                  }
                  badges={
                    <>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {isEmailConsentSource(source) ? <span className="text-sm text-muted-foreground">{EMAIL_CONSENT_LABELS[source]}</span> : null}
                      {member.hasPhone && callMeta ? <Badge variant={callMeta.variant}>{callMeta.label}</Badge> : null}
                      {(officers[member.id] ?? []).map(title => (
                        <Badge key={`o-${title}`} variant="default">
                          {title}
                        </Badge>
                      ))}
                      {groupNamesFor(member.groupIds, groups).map(groupName => (
                        <Badge key={`g-${groupName}`} variant="outline">
                          {groupName}
                        </Badge>
                      ))}
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
                          <Mail aria-hidden="true" />
                          {state === "opted_out" ? "They asked to be added back" : "Record consent"}
                        </Button>
                      ) : null}
                      {state === "ready" ? (
                        <Button size="row" variant="outline" loading={busy} title="Record that they asked to stop getting email" onClick={() => update(member, { emailOptOut: true }, "Opt-out recorded")}>
                          <ShieldOff aria-hidden="true" />
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
                          <PhoneCall aria-hidden="true" />
                          {callState === "opted_out" ? "They asked to be called again" : "Record call consent"}
                        </Button>
                      ) : null}
                      {callState === "ready" ? (
                        <Button size="row" variant="outline" loading={busy} title="Record that they asked not to be called" onClick={() => update(member, { callOptOut: true }, "Call opt-out recorded")}>
                          <PhoneOff aria-hidden="true" />
                          They asked not to be called
                        </Button>
                      ) : null}
                      {phonesReady ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => setEditing(member)} aria-label={`Edit contact for ${displayName}`} title="Phone numbers, language, household and family">
                          <Phone aria-hidden="true" />
                          {member.hasPhone || member.contact ? "Edit contact" : "Add phone"}
                        </Button>
                      ) : null}
                      <Button asChild size="row" variant="outline">
                        <Link href={`/admin/members/${member.id}` as Route} aria-label={`Profile of ${displayName}`} title="Open the profile: membership, family, notes and calls">
                          <UserRound aria-hidden="true" />
                          Profile
                        </Link>
                      </Button>
                      {superAdmin ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => setRenaming(member)} aria-label={`Edit name of ${displayName}`} title="Fix a typo in the name (super admin)">
                          <Pencil aria-hidden="true" />
                          Edit name
                        </Button>
                      ) : null}
                      {groups.length > 0 ? (
                        <Button size="row" variant="outline" loading={busy} onClick={() => setGroupsFor(member)} aria-label={`Groups for ${displayName}`} title="Choose the groups they belong to">
                          <Users aria-hidden="true" />
                          Groups
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
                          title="Turn this member off (asks first)"
                          onClick={() => setDisabling(member)}
                        >
                          <UserX aria-hidden="true" />
                          Turn off…
                        </Button>
                      ) : (
                        <Button size="row" variant="ghost" loading={busy} title="Turn this member back on" onClick={() => update(member, { status: "active" }, "Member turned on")}>
                          <UserCheck aria-hidden="true" />
                          Turn on
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

      {exporting ? (
        <ExportMembersDialog
          total={members.length}
          shown={visible.length}
          filtered={visible.length !== members.length}
          phonesReady={phonesReady}
          phoneHint={!e2ee.enabled ? "Phone numbers can be included once encryption is on." : "Unlock this device to include phone numbers."}
          busy={exportBusy}
          onClose={() => setExporting(false)}
          onDownload={downloadExport}
        />
      ) : null}

      {renaming ? (
        <RenameMemberDialog
          currentName={renaming.name ?? ""}
          label={memberDisplayName(renaming)}
          nameRequired={!hasEmail(renaming)}
          busy={busyId === renaming.id}
          onClose={() => setRenaming(null)}
          onSave={async name => {
            if (await update(renaming, { name: name.trim() || null }, "Name updated")) setRenaming(null);
          }}
        />
      ) : null}

      {groupsFor ? (
        <MemberGroupsDialog
          name={memberDisplayName(groupsFor)}
          groups={groups}
          current={(groupsFor.groupIds ?? []).filter(id => groups.some(g => g.id === id))}
          busy={busyId === groupsFor.id}
          onClose={() => setGroupsFor(null)}
          onSave={async (add, remove) => {
            const target = groupsFor;
            setBusyId(target.id);
            try {
              for (const id of add) await call(`/api/admin/groups/${id}/members`, "POST", { add: [target.id] });
              for (const id of remove) await call(`/api/admin/groups/${id}/members`, "POST", { remove: [target.id] });
              const kept = (target.groupIds ?? []).filter(id => !remove.includes(id));
              replace({ ...target, groupIds: [...kept, ...add] });
              toast.success("Groups saved");
              setGroupsFor(null);
            } catch (error) {
              toast.error(errorText(error, "Could not save groups"));
              await refresh();
            } finally {
              setBusyId(null);
            }
          }}
        />
      ) : null}

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
        title={`Turn off ${disabling ? memberDisplayName(disabling) : "this member"}?`}
        description="They stay on the list but get no broadcasts and are left out of calls until you turn them on again."
        confirmLabel="Turn off"
        busy={disabling !== null && busyId === disabling.id}
        onConfirm={async () => {
          if (!disabling) return;
          await update(disabling, { status: "disabled" }, "Member turned off");
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

const EMPTY_FORM: ContactForm = { phone: "", altPhone: "", language: "", household: "", notes: "" };

function ContactDialog({
  member,
  initial,
  onClose,
  onSave
}: {
  member: MemberRow;
  initial: ContactView | undefined;
  onClose: () => void;
  onSave: (form: ContactForm) => Promise<void>;
}) {
  const [form, setForm] = useState<ContactForm>(() => {
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
            <DialogTitle>Contact for {memberDisplayName(member)}</DialogTitle>
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
