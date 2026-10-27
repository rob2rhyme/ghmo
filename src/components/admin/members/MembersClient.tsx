"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Upload, UserPlus, Users } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  EMAIL_CONSENT_LABELS,
  MAX_IMPORT_ROWS,
  isEmailConsentSource,
  memberEmailState,
  parseMemberCsv,
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
};

const STATE_LABEL: Record<MemberEmailState, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  ready: { label: "Can be emailed", variant: "success" },
  no_consent: { label: "No consent recorded", variant: "warning" },
  opted_out: { label: "Opted out", variant: "destructive" },
  bounced: { label: "Address bounced", variant: "destructive" },
  inactive: { label: "Disabled", variant: "secondary" }
};

type Filter = "all" | MemberEmailState;

async function call<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

export default function MembersClient({ initialMembers }: { initialMembers: MemberRow[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [adding, setAdding] = useState(false);

  const [csv, setCsv] = useState("");
  const [attested, setAttested] = useState(false);
  const [importing, setImporting] = useState(false);
  const preview = useMemo(() => (csv.trim() ? parseMemberCsv(csv) : null), [csv]);

  const counts = useMemo(() => {
    const result: Record<MemberEmailState, number> = { ready: 0, no_consent: 0, opted_out: 0, bounced: 0, inactive: 0 };
    for (const member of members) result[memberEmailState(member)] += 1;
    return result;
  }, [members]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter(member => {
      if (filter !== "all" && memberEmailState(member) !== filter) return false;
      if (!needle) return true;
      return member.emailLower.includes(needle) || (member.name ?? "").toLowerCase().includes(needle);
    });
  }, [members, query, filter]);

  const replace = (updated: MemberRow) => setMembers(list => list.map(m => (m.id === updated.id ? updated : m)));

  const refresh = async () => {
    const res = await fetch("/api/organizations/ghmo/members", { cache: "no-store" });
    if (res.ok) setMembers(((await res.json()) as { members: MemberRow[] }).members);
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    try {
      const { member } = await call<{ member: MemberRow }>("/api/organizations/ghmo/members", "POST", {
        email,
        name: name || null,
        ...(agreed ? { emailConsent: { source: "admin_on_request" } } : {})
      });
      setMembers(list => [...list, member].sort((a, b) => a.emailLower.localeCompare(b.emailLower)));
      setEmail("");
      setName("");
      setAgreed(false);
      toast.success("Member added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add member");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusyId(null);
    }
  };

  const runImport = async () => {
    if (!preview || preview.rows.length === 0) return;
    setImporting(true);
    try {
      const { created, skipped } = await call<{ created: number; skipped: number }>("/api/organizations/ghmo/members/import", "POST", {
        rows: preview.rows,
        attested: true
      });
      toast.success(`${created} added${skipped ? `, ${skipped} already on the list` : ""}`);
      setCsv("");
      setAttested(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: members.length },
    { key: "ready", label: "Can be emailed", count: counts.ready },
    { key: "no_consent", label: "No consent", count: counts.no_consent },
    { key: "opted_out", label: "Opted out", count: counts.opted_out },
    { key: "inactive", label: "Disabled", count: counts.inactive }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus aria-hidden="true" className="size-5" /> Add a member
            </CardTitle>
            <CardDescription>Only tick the box if this person told you they want to receive email from us.</CardDescription>
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
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>This person asked to receive email from us.</span>
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
              Paste a list with one email per line, or a CSV with an <code>email</code> column and an optional <code>name</code> column (up to{" "}
              {MAX_IMPORT_ROWS} at a time). People already on the list are left alone, so an import never re-subscribes someone who opted out.
            </CardDescription>
          </CardHeader>
          <div className="space-y-3">
            <Label htmlFor="member-csv" className="sr-only">
              Member list
            </Label>
            <Textarea id="member-csv" rows={6} value={csv} onChange={e => setCsv(e.target.value)} placeholder={"email,name\nsam@example.org,Sam Lee"} />
            {preview ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
                <p className="font-medium">{preview.rows.length} valid {preview.rows.length === 1 ? "address" : "addresses"} found.</p>
                {preview.truncated ? <p className="text-warning">Only the first {MAX_IMPORT_ROWS} will be imported.</p> : null}
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
            <Button onClick={runImport} loading={importing} disabled={!attested || !preview || preview.rows.length === 0}>
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
            {counts.ready} of {members.length} can be emailed.
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
                return (
                  <li key={member.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.name || member.emailLower}</p>
                      {member.name ? <p className="truncate text-sm text-muted-foreground">{member.emailLower}</p> : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        {isEmailConsentSource(source) ? <span className="text-xs text-muted-foreground">{EMAIL_CONSENT_LABELS[source]}</span> : null}
                      </div>
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
    </div>
  );
}
