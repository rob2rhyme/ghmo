"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Network, Users } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { countByCaller, moveMember, planAssignments, spread, type Assignment, type AssignmentChange, type TreeMember } from "@/src/lib/callingTree";
import { formatShortDate } from "@/src/lib/format";
import { memberCallState } from "@/src/lib/members";
import { cn } from "@/src/lib/utils";

type Candidate = { id: string; name: string; status: "active" | "disabled" };
type StoredAssignment = Assignment & { assignedAt: string | null; assignedBy: string };
type TreeResponse = {
  me: { uid: string; superAdmin: boolean };
  tree: { callers: string[]; version: number; updatedAt: string | null; updatedBy: string | null };
  counts: Record<string, number>;
  total: number;
  candidates: Candidate[];
  assignments: StoredAssignment[];
};
type MemberLite = {
  id: string;
  name?: string | null;
  emailLower: string;
  status: "active" | "disabled";
  hasPhone?: boolean;
  contact?: unknown;
  phoneConsent?: { source?: string } | null;
  callOptOutAt?: unknown;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const REASON_LABEL: Record<AssignmentChange["reason"], string> = {
  placed: "newly placed",
  household: "joined their household's caller",
  caller_removed: "moved from a caller who left",
  ineligible: "removed (can no longer be called)"
};

export default function CallingTreeClient() {
  return (
    <EncryptionGate what="the calling tree">
      <CallingTree />
    </EncryptionGate>
  );
}

function CallingTree() {
  const [data, setData] = useState<TreeResponse | null>(null);
  const [members, setMembers] = useState<MemberLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callers, setCallers] = useState<string[]>([]);
  const [draft, setDraft] = useState<Assignment[]>([]);
  const [manual, setManual] = useState<Set<string>>(() => new Set());
  const [changes, setChanges] = useState<AssignmentChange[] | null>(null);
  const [saving, setSaving] = useState(false);
  const { contacts, ready, e2ee } = useMemberContacts(members ?? []);

  const fetchAll = () => Promise.all([api<TreeResponse>("/api/admin/calling-tree"), api<{ members: MemberLite[] }>("/api/organizations/ghmo/members")]);
  const apply = ([tree, list]: [TreeResponse, { members: MemberLite[] }]) => {
    setData(tree);
    setError(null);
    setMembers(list.members);
    setCallers(tree.tree.callers);
    setDraft(tree.assignments.map(({ memberId, callerUid }) => ({ memberId, callerUid })));
    setManual(new Set());
    setChanges(null);
  };
  const load = () => fetchAll().then(apply).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the calling tree"));
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(result => {
        if (!cancelled) apply(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the calling tree");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const memberById = useMemo(() => new Map((members ?? []).map(m => [m.id, m])), [members]);
  const nameOf = (uid: string) => data?.candidates.find(c => c.id === uid)?.name ?? uid;
  const memberLabel = (id: string) => {
    const m = memberById.get(id);
    return m ? m.name || m.emailLower : id;
  };

  /** What the pure rules see: eligibility from the plaintext flags, household from the decrypted contact. */
  const treeMembers = useMemo<TreeMember[]>(
    () =>
      (members ?? []).map(m => {
        const view = contacts.get(m.id);
        return { id: m.id, name: m.name || m.emailLower, household: view?.ok ? view.contact.household : null, eligible: memberCallState(m) === "ready" };
      }),
    [members, contacts]
  );
  const eligibleCount = treeMembers.filter(m => m.eligible).length;
  const awaitingDecrypt = (members ?? []).some(m => m.contact && !contacts.has(m.id));

  const counts = countByCaller(draft, callers);
  const unassigned = treeMembers.filter(m => m.eligible && !draft.some(a => a.memberId === m.id));
  const dirty = data ? JSON.stringify({ callers, draft }) !== JSON.stringify({ callers: data.tree.callers, draft: data.assignments.map(({ memberId, callerUid }) => ({ memberId, callerUid })) }) : false;

  const toggleCaller = (uid: string) => setCallers(list => (list.includes(uid) ? list.filter(x => x !== uid) : [...list, uid]));

  const plan = () => {
    const result = planAssignments({ members: treeMembers, callers, existing: draft });
    setDraft(result.assignments);
    setChanges(result.changes);
    if (result.changes.length === 0) toast.info("Nothing to change: everyone callable already has a caller.");
  };

  const move = (memberId: string, callerUid: string) => {
    setDraft(list => moveMember(list, memberId, callerUid));
    setManual(set => new Set(set).add(memberId));
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await api<{ version: number; added: number; moved: number; removed: number }>("/api/admin/calling-tree", {
        method: "PUT",
        body: JSON.stringify({ callers, assignments: draft.map(a => ({ ...a, manual: manual.has(a.memberId) })) })
      });
      toast.success(`Calling tree saved (v${result.version}): ${result.added} added, ${result.moved} moved, ${result.removed} removed`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <EmptyState icon={<Network aria-hidden="true" />} title="Could not load the calling tree" description={error} action={<Button onClick={load}>Try again</Button>} />;
  }
  if (!data || !members) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading the calling tree…</span>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const superAdmin = data.me.superAdmin;
  const activeCandidates = data.candidates.filter(c => c.status === "active");
  const encryptionOn = e2ee.enabled;
  const planBlocker =
    callers.length === 0
      ? "Tick at least one caller first."
      : !encryptionOn
        ? "Turn on encryption first: households and numbers are read from encrypted contacts."
        : !ready
          ? "Unlock this device to plan assignments."
          : awaitingDecrypt
            ? "Reading contacts on this device. One moment…"
            : null;
  const lastSaved = data.tree.updatedAt ? formatShortDate(data.tree.updatedAt) : "";

  return (
    <div className="flex flex-col gap-6">
      {!superAdmin ? (
        <Alert variant="info">
          <Network />
          <AlertTitle>Only a super admin can change the calling tree</AlertTitle>
          <AlertDescription>You can see the callers and how many people each one has. Your own people are under My Calls.</AlertDescription>
        </Alert>
      ) : null}

      {eligibleCount === 0 ? (
        <AdminSectionCard title="Get the calling tree ready" description="Nobody can be called yet. Work through these steps in order; each one ticks itself once it is done.">
          <ol className="flex flex-col gap-3" aria-label="Steps to get the calling tree ready">
            <SetupStep
              n={1}
              done={encryptionOn}
              title="Turn on encryption"
              detail="Phone numbers are stored with end-to-end encryption, so it has to be on before anyone can add a number."
              href="/admin/encryption"
              linkLabel="Open Encryption"
            />
            <SetupStep
              n={2}
              done={eligibleCount > 0}
              title="Add phone numbers and call consent"
              detail="On Members, add each person's number and tick that they gave it for community calls."
              href="/admin/members"
              linkLabel="Open Members"
            />
            <SetupStep n={3} done={callers.length > 0} title="Choose callers" detail="Tick the board members who will phone people, in Callers below." />
            <SetupStep
              n={4}
              done={false}
              title="Open a campaign"
              detail="When there is news to share, open a campaign and each caller gets their list under My Calls."
              href="/admin/call-campaigns"
              linkLabel="Open Call Campaigns"
            />
          </ol>
        </AdminSectionCard>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-5" /> Callers
          </CardTitle>
          <CardDescription>Board members who phone their assigned people.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            <strong className="text-lg font-semibold text-foreground tabular-nums">
              {eligibleCount} of {members.length}
            </strong>{" "}
            members can be called.
          </p>
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">Why?</summary>
            <p className="mt-1 text-muted-foreground">Someone can be called when all of these are true:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>they are an active member</li>
              <li>a phone number is on file</li>
              <li>their call consent is recorded</li>
              <li>they have not asked not to be called</li>
            </ul>
          </details>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Callers">
          {activeCandidates.map(candidate => {
            const on = callers.includes(candidate.id);
            return (
              <li key={candidate.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border px-3">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={on} disabled={!superAdmin} onChange={() => toggleCaller(candidate.id)} />
                  <span className="truncate">{candidate.name}</span>
                </label>
                {on ? <Badge variant="secondary">{counts[candidate.id] ?? 0} people</Badge> : null}
              </li>
            );
          })}
        </ul>
        {superAdmin ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={plan} disabled={planBlocker !== null} className="max-sm:h-11">
                Plan assignments
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty} variant={dirty ? "default" : "outline"} className="max-sm:h-11">
                Save calling tree
              </Button>
              {dirty ? (
                <Button variant="ghost" onClick={load} disabled={saving} className="max-sm:h-11">
                  Discard changes
                </Button>
              ) : null}
            </div>
            {planBlocker ? <p className="text-sm text-muted-foreground">{planBlocker}</p> : null}
            <p className="text-sm text-muted-foreground">
              <span>
                {eligibleCount === 0
                  ? "Nobody can be called yet."
                  : unassigned.length > 0
                    ? `${unassigned.length} callable ${unassigned.length === 1 ? "person has" : "people have"} no caller yet.`
                    : "Everyone callable has a caller."}
              </span>
              {spread(counts) > 1 ? ` Lists differ by ${spread(counts)}.` : ""}
            </p>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{lastSaved ? `Last saved ${lastSaved}.` : "Not saved yet."}</p>
      </Card>

      {changes && changes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Planned changes ({changes.length})</CardTitle>
            <CardDescription>Nothing is saved until you press Save calling tree. People already assigned stay where they are.</CardDescription>
          </CardHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm" aria-label="Planned changes">
            {changes.map(change => (
              <li key={change.memberId}>
                <span className="font-medium">{memberLabel(change.memberId)}</span>: {REASON_LABEL[change.reason]}
                {change.to ? ` → ${nameOf(change.to)}` : ""}
                {change.from && change.reason !== "placed" ? ` (was ${nameOf(change.from)})` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {callers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {callers.map(uid => {
            const mine = draft.filter(a => a.callerUid === uid).map(a => memberById.get(a.memberId)).filter((m): m is MemberLite => Boolean(m));
            return (
              <Card key={uid} className="min-w-0">
                <CardHeader>
                  <CardTitle>{nameOf(uid)}</CardTitle>
                  <CardDescription>
                    {mine.length} {mine.length === 1 ? "person" : "people"}
                  </CardDescription>
                </CardHeader>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody yet. Press Plan assignments to share people out.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm" aria-label={`People assigned to ${nameOf(uid)}`}>
                    {mine
                      .sort((a, b) => (a.name || a.emailLower).localeCompare(b.name || b.emailLower))
                      .map(m => {
                        const view = contacts.get(m.id);
                        const household = view?.ok ? view.contact.household : undefined;
                        return (
                          <li key={m.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0 truncate">
                              {m.name || m.emailLower}
                              {household ? <span className="text-muted-foreground"> · {household}</span> : null}
                              {manual.has(m.id) ? (
                                <Badge variant="outline" className="ml-2">
                                  moved
                                </Badge>
                              ) : null}
                            </span>
                            {superAdmin && callers.length > 1 ? (
                              <div className="w-full shrink-0 sm:w-44">
                                <Select aria-label={`Caller for ${m.name || m.emailLower}`} className="max-sm:h-11" value={uid} onChange={e => move(m.id, e.target.value)}>
                                  {callers.map(c => (
                                    <option key={c} value={c}>
                                      {nameOf(c)}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      ) : eligibleCount > 0 ? (
        // On day one the checklist above already covers this step.
        <EmptyState
          icon={<Network aria-hidden="true" />}
          title="No callers yet"
          description={superAdmin ? "Tick the board members who will phone people, then press Plan assignments." : "A super admin chooses the callers."}
        />
      ) : null}
    </div>
  );
}

/** One numbered step of the day-one checklist; ticks itself when `done`. */
function SetupStep({ n, done, title, detail, href, linkLabel }: { n: number; done: boolean; title: string; detail: string; href?: Route; linkLabel?: string }) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            <span className="sr-only">Step {n}: </span>
            {title}
            {done ? <span className="sr-only"> (done)</span> : null}
          </p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      {href && linkLabel && !done ? (
        <Button asChild variant="outline" className="max-sm:h-11 max-sm:w-full">
          <Link href={href}>{linkLabel}</Link>
        </Button>
      ) : done ? (
        <Badge variant="success" className="self-start sm:self-center">
          Done
        </Badge>
      ) : null}
    </li>
  );
}
