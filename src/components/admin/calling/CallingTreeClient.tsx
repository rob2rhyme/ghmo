"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Network, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { countByCaller, moveMember, planAssignments, spread, type Assignment, type AssignmentChange, type TreeMember } from "@/src/lib/callingTree";
import { memberCallState } from "@/src/lib/members";

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
    <EncryptionGate what="The calling tree">
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
  const { contacts, ready } = useMemberContacts(members ?? []);

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

  return (
    <div className="space-y-6">
      {!superAdmin ? (
        <Alert variant="info">
          <Network />
          <AlertTitle>Only a super admin can change the calling tree</AlertTitle>
          <AlertDescription>You can see the callers and how many people each one has. Your own people are under My Calls.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-5" /> Callers
          </CardTitle>
          <CardDescription>
            Board members who phone their assigned people. {eligibleCount} of {members.length} members can be called (active, number on file, consent recorded, no
            opt-out). Version {data.tree.version}.
          </CardDescription>
        </CardHeader>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Callers">
          {activeCandidates.map(candidate => {
            const on = callers.includes(candidate.id);
            return (
              <li key={candidate.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} disabled={!superAdmin} onChange={() => toggleCaller(candidate.id)} />
                  <span>{candidate.name}</span>
                </label>
                {on ? <Badge variant="secondary">{counts[candidate.id] ?? 0} people</Badge> : null}
              </li>
            );
          })}
        </ul>
        {superAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={plan} disabled={!ready || awaitingDecrypt || callers.length === 0}>
              Plan assignments
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty} variant={dirty ? "default" : "outline"}>
              Save calling tree
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={load} disabled={saving}>
                Discard changes
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {eligibleCount === 0
                ? "Nobody can be called yet."
                : unassigned.length > 0
                  ? `${unassigned.length} callable ${unassigned.length === 1 ? "person has" : "people have"} no caller yet.`
                  : "Everyone callable has a caller."}
              {spread(counts) > 1 ? ` Lists differ by ${spread(counts)}.` : ""}
            </span>
          </div>
        ) : null}
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

      <div className="grid gap-4 md:grid-cols-2">
        {callers.map(uid => {
          const mine = draft.filter(a => a.callerUid === uid).map(a => memberById.get(a.memberId)).filter((m): m is MemberLite => Boolean(m));
          return (
            <Card key={uid}>
              <CardHeader>
                <CardTitle className="text-base">{nameOf(uid)}</CardTitle>
                <CardDescription>{mine.length} {mine.length === 1 ? "person" : "people"}</CardDescription>
              </CardHeader>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody yet.</p>
              ) : (
                <ul className="divide-y divide-border text-sm" aria-label={`People assigned to ${nameOf(uid)}`}>
                  {mine
                    .sort((a, b) => (a.name || a.emailLower).localeCompare(b.name || b.emailLower))
                    .map(m => {
                      const view = contacts.get(m.id);
                      const household = view?.ok ? view.contact.household : undefined;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="min-w-0 truncate">
                            {m.name || m.emailLower}
                            {household ? <span className="text-muted-foreground"> · {household}</span> : null}
                            {manual.has(m.id) ? <Badge variant="outline" className="ml-2">moved</Badge> : null}
                          </span>
                          {superAdmin && callers.length > 1 ? (
                            <select
                              aria-label={`Caller for ${m.name || m.emailLower}`}
                              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                              value={uid}
                              onChange={e => move(m.id, e.target.value)}
                            >
                              {callers.map(c => (
                                <option key={c} value={c}>
                                  {nameOf(c)}
                                </option>
                              ))}
                            </select>
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

      {callers.length === 0 ? (
        <EmptyState
          icon={<Network aria-hidden="true" />}
          title="No callers yet"
          description={superAdmin ? "Tick the board members who will phone people, then press Plan assignments." : "A super admin chooses the callers."}
        />
      ) : null}
    </div>
  );
}
