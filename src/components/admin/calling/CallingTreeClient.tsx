"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Network } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Steps } from "@/src/components/ui/steps";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { WhatIsThis } from "@/src/components/admin/encryption/WhatIsThis";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { countByCaller, moveMember, planAssignments, spread, type Assignment, type AssignmentChange, type TreeMember } from "@/src/lib/callingTree";
import { formatShortDate } from "@/src/lib/format";
import { memberCallState } from "@/src/lib/members";

type Candidate = { id: string; name: string; status: "active" | "disabled"; suggested?: boolean };
type CallersGroup = { id: string; name: string; needsAdminAccess: { memberId: string; name: string }[] };
type StoredAssignment = Assignment & { assignedAt: string | null; assignedBy: string };
type TreeResponse = {
  me: { uid: string; superAdmin: boolean };
  tree: { callers: string[]; version: number; updatedAt: string | null; updatedBy: string | null };
  counts: Record<string, number>;
  total: number;
  candidates: Candidate[];
  callersGroup?: CallersGroup | null;
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
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
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
      toast.success(`Calling tree saved: ${result.added} added, ${result.moved} moved, ${result.removed} removed`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <Network />
        <AlertTitle>Couldn&apos;t load the calling tree</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{error}</span>
          <Button variant="outline" size="row" onClick={load}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
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
// Admins from the phone tree callers group come first (plan §15, 11-C); the rest keep their order.
  const activeCandidates = data.candidates.filter(c => c.status === "active").sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  const callersGroup = data.callersGroup ?? null;
  const suggestedIds = activeCandidates.filter(c => c.suggested).map(c => c.id);
  const suggestionsLeft = suggestedIds.filter(id => !callers.includes(id));
  const encryptionOn = e2ee.enabled;
  const planBlocker =
    callers.length === 0
      ? "Check at least one caller first."
      : !encryptionOn
        ? "Turn on encryption first: households and numbers are read from encrypted contacts."
        : !ready
          ? "Unlock this device to plan assignments."
          : awaitingDecrypt
            ? "Reading contacts on this device. One moment…"
            : null;
  const lastSaved = data.tree.updatedAt ? formatShortDate(data.tree.updatedAt) : "";
  // One status line under the buttons: why Plan is greyed out, or else where the assignments stand.
  // On day one the checklist already says nobody can be called, so only the reason is shown then.
  const assignmentStatus =
    eligibleCount === 0
      ? null
      : unassigned.length > 0
        ? `${unassigned.length} callable ${unassigned.length === 1 ? "person has" : "people have"} no caller yet.`
        : "Everyone callable has a caller.";

  const setupSteps: { done: boolean; title: string; detail: string; href?: Route; linkLabel?: string }[] = [
    {
      done: encryptionOn,
      title: "Turn on encryption",
      detail: "Phone numbers are stored with end-to-end encryption, so it has to be on before anyone can add a number.",
      href: "/admin/encryption",
      linkLabel: "Open Encryption"
    },
    {
      done: eligibleCount > 0,
      title: "Add phone numbers and call consent",
      detail: "On Members, add each person's number and check that they gave it for community calls.",
      href: "/admin/members",
      linkLabel: "Open Members"
    },
    { done: callers.length > 0, title: "Choose callers", detail: "Check the admins who will phone people, in Callers below." },
    {
      done: false,
      title: "Open a campaign",
      detail: "When there is news to share, open a campaign and each caller gets their list under My calls.",
      href: "/admin/call-campaigns",
      linkLabel: "Open Call campaigns"
    }
  ];
  const firstOpen = setupSteps.findIndex(step => !step.done);

  return (
    <div className="flex flex-col gap-6">
      {!superAdmin ? (
        <Alert variant="info">
          <Network />
          <AlertTitle>Only a super admin can change the calling tree</AlertTitle>
          <AlertDescription>You can see the callers and how many people each one has. Your own people are under My calls.</AlertDescription>
        </Alert>
      ) : null}

      {eligibleCount === 0 ? (
        <AdminSectionCard title="Get the calling tree ready" description="Nobody can be called yet. Work through these steps in order; each one is checked off once it is done.">
          <Steps
            layout="list"
            label="Steps to get the calling tree ready"
            steps={setupSteps.map((step, index) => ({
              title: step.title,
              description: step.detail,
              state: step.done ? "done" : index === firstOpen ? "current" : "todo",
              action: step.done ? (
                <Badge variant="success">Done</Badge>
              ) : step.href && step.linkLabel ? (
                <Button asChild variant="outline" size="row">
                  <Link href={step.href}>{step.linkLabel}</Link>
                </Button>
              ) : undefined
            }))}
          />
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard
        title="Callers"
        description="Admins who phone their assigned people."
        actions={<span className="text-sm text-muted-foreground">{lastSaved ? `Last saved ${lastSaved}` : "Not saved yet"}</span>}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            <strong className="text-lg font-semibold text-foreground tabular-nums">
              {eligibleCount} of {members.length}
            </strong>{" "}
            members can be called.
          </p>
          <WhatIsThis question="Why?">
            Someone can be called when they are an active member, a phone number is on file, their call consent is recorded, and they haven&apos;t asked not to be
            called.
          </WhatIsThis>
        </div>
        {callersGroup && callersGroup.needsAdminAccess.length > 0 ? (
          <Alert variant="info">
            <Network />
            <AlertTitle>Some callers group members need admin access</AlertTitle>
            <AlertDescription>
              <span>
                {callersGroup.needsAdminAccess.map(person => person.name).join(", ")} {callersGroup.needsAdminAccess.length === 1 ? "is" : "are"} in {callersGroup.name} but{" "}
                {callersGroup.needsAdminAccess.length === 1 ? "isn't an admin" : "aren't admins"} yet, so they can&apos;t use My calls. Callers have to be admins.{" "}
              </span>
              <Link href={`/admin/groups/${callersGroup.id}` as Route} className="underline underline-offset-4">
                Open the group
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        {superAdmin && callersGroup && suggestedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setCallers(list => [...new Set([...list, ...suggestedIds])])} disabled={suggestionsLeft.length === 0} className="max-sm:h-11">
              Check everyone in the group
            </Button>
            <p className="text-sm text-muted-foreground">
              {suggestionsLeft.length === 0
                ? `Everyone in ${callersGroup.name} who is an admin is already checked.`
                : `${suggestionsLeft.length} admin${suggestionsLeft.length === 1 ? "" : "s"} from ${callersGroup.name} not checked yet. Nothing is saved until you save the calling tree.`}
            </p>
          </div>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Callers">
          {activeCandidates.map(candidate => {
            const on = callers.includes(candidate.id);
            return (
              <li key={candidate.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border px-3">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={on} disabled={!superAdmin} onChange={() => toggleCaller(candidate.id)} />
                  <span className="truncate">{candidate.name}</span>
                </label>
                {candidate.suggested ? <Badge variant="outline">In {callersGroup?.name ?? "callers group"}</Badge> : null}
                {on ? <Badge variant="secondary">{people(counts[candidate.id] ?? 0)}</Badge> : null}
              </li>
            );
          })}
        </ul>
        {superAdmin ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={plan} disabled={planBlocker !== null} variant={dirty ? "outline" : "default"} className="max-sm:h-11">
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
            {planBlocker || assignmentStatus ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {planBlocker ? (
                  planBlocker
                ) : (
                  <>
                    <span>{assignmentStatus}</span>
                    {spread(counts) > 1 ? ` Lists differ by ${people(spread(counts))}.` : ""}
                  </>
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </AdminSectionCard>

      {changes && changes.length > 0 ? (
        <AdminSectionCard
          title={`Planned changes (${changes.length})`}
          description="Nothing is saved until you press Save calling tree. People already assigned stay where they are."
        >
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm" aria-label="Planned changes">
            {changes.map(change => (
              <li key={change.memberId}>
                <span className="font-medium">{memberLabel(change.memberId)}</span>: {REASON_LABEL[change.reason]}
                {change.to ? ` → ${nameOf(change.to)}` : ""}
                {change.from && change.reason !== "placed" ? ` (was ${nameOf(change.from)})` : ""}
              </li>
            ))}
          </ul>
        </AdminSectionCard>
      ) : null}

      {callers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {callers.map(uid => {
            const mine = draft.filter(a => a.callerUid === uid).map(a => memberById.get(a.memberId)).filter((m): m is MemberLite => Boolean(m));
            return (
              <AdminSectionCard key={uid} as="h3" title={nameOf(uid)} description={people(mine.length)} className="min-w-0">
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody yet. Press Plan assignments to share people out.</p>
                ) : (
                  <AdminList bare label={`People assigned to ${nameOf(uid)}`}>
                    {mine
                      .sort((a, b) => (a.name || a.emailLower).localeCompare(b.name || b.emailLower))
                      .map(m => {
                        const view = contacts.get(m.id);
                        const household = view?.ok ? view.contact.household : undefined;
                        return (
                          <AdminListRow
                            key={m.id}
                            title={m.name || m.emailLower}
                            meta={household || undefined}
                            badges={manual.has(m.id) ? <Badge variant="outline">Moved</Badge> : null}
                            actions={
                              superAdmin && callers.length > 1 ? (
                                <div className="w-full sm:w-44">
                                  <Select aria-label={`Caller for ${m.name || m.emailLower}`} className="max-sm:h-11" value={uid} onChange={e => move(m.id, e.target.value)}>
                                    {callers.map(c => (
                                      <option key={c} value={c}>
                                        {nameOf(c)}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                              ) : null
                            }
                          />
                        );
                      })}
                  </AdminList>
                )}
              </AdminSectionCard>
            );
          })}
        </div>
      ) : eligibleCount > 0 ? (
        // On day one the checklist above already covers this step.
        <EmptyState
          icon={<Network aria-hidden="true" />}
          title="No callers yet"
          description={superAdmin ? "Check the admins who will phone people, then press Plan assignments." : "A super admin chooses the callers."}
        />
      ) : null}
    </div>
  );
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
