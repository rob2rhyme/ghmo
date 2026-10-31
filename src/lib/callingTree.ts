/**
 * The calling tree (plan §12, Phase 9-B): every member who may be called is assigned to ONE BOD
 * caller, and the assignment stays put across campaigns so callers get to know their people.
 *
 * The split runs in the browser, not on the server: a member's household lives inside the
 * encrypted contact envelope, which only an unlocked admin device can read. The server stores
 * the result (member id → caller uid) and never needs the contact itself.
 *
 * Everything here is pure, so the rules are unit-tested without Firestore or keys.
 */

export const CALLING_TREE_PATH = "organizations/ghmo/callingTree";

export type TreeMember = {
  id: string;
  /** For a stable order; the id breaks ties. */
  name?: string | null;
  /** From the decrypted contact; people who share one is one calling unit. */
  household?: string | null;
  /** `memberCallState(member) === "ready"`: active, has a phone, consent recorded, no call opt-out. */
  eligible: boolean;
};

export type Assignment = { memberId: string; callerUid: string };

export type AssignmentChange = {
  memberId: string;
  from: string | null;
  to: string | null;
  reason: "placed" | "caller_removed" | "ineligible" | "household";
};

export type AssignmentPlan = {
  assignments: Assignment[];
  changes: AssignmentChange[];
  /** Eligible members per caller after the plan, in `callers` order. */
  counts: Record<string, number>;
};

/** One key for everyone in a household: trimmed, lower-cased, spaces collapsed. */
export function householdKey(value?: string | null): string | null {
  const key = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return key || null;
}

const byStableOrder = (a: TreeMember, b: TreeMember) => (a.name ?? "").localeCompare(b.name ?? "") || a.id.localeCompare(b.id);

/**
 * Builds the next assignment list from the current one.
 *
 *  1. Members who are no longer eligible, and assignments to callers no longer on the list, are dropped.
 *  2. Everything else stays exactly as it is (stability).
 *  3. An unassigned member whose household already has a caller joins that caller.
 *  4. The rest are placed one household (or single person) at a time, biggest households first and
 *     then in a stable order, each onto the caller with the fewest members so far; ties go to the
 *     earlier caller in `callers`.
 *
 * With no households the result is equal within one member; re-running with the same input changes
 * nothing; removing a caller moves only that caller's members.
 */
export function planAssignments(params: { members: TreeMember[]; callers: string[]; existing: Assignment[] }): AssignmentPlan {
  const callers = [...new Set(params.callers)];
  const eligible = new Map(params.members.filter(m => m.eligible).map(m => [m.id, m]));
  const current = new Map<string, string>();
  const changes: AssignmentChange[] = [];

  // 1 and 2: keep what still makes sense.
  for (const { memberId, callerUid } of params.existing) {
    if (!eligible.has(memberId)) {
      if (params.members.some(m => m.id === memberId)) changes.push({ memberId, from: callerUid, to: null, reason: "ineligible" });
      continue;
    }
    if (!callers.includes(callerUid)) {
      changes.push({ memberId, from: callerUid, to: null, reason: "caller_removed" });
      continue;
    }
    current.set(memberId, callerUid);
  }

  const counts: Record<string, number> = Object.fromEntries(callers.map(uid => [uid, 0]));
  for (const callerUid of current.values()) counts[callerUid] += 1;

  if (callers.length > 0) {
    // Group the still-unassigned eligible members into units: one per household, one per person otherwise.
    const householdCaller = new Map<string, string>();
    for (const [memberId, callerUid] of current) {
      const key = householdKey(eligible.get(memberId)?.household);
      if (key && !householdCaller.has(key)) householdCaller.set(key, callerUid);
    }
    const units = new Map<string, TreeMember[]>();
    for (const member of [...eligible.values()].sort(byStableOrder)) {
      if (current.has(member.id)) continue;
      const key = householdKey(member.household) ?? `single:${member.id}`;
      const unit = units.get(key) ?? [];
      unit.push(member);
      units.set(key, unit);
    }

    // 3: join a household that already has a caller.
    for (const [key, unit] of units) {
      const callerUid = householdCaller.get(key);
      if (!callerUid) continue;
      for (const member of unit) {
        current.set(member.id, callerUid);
        counts[callerUid] += 1;
        changes.push({ memberId: member.id, from: null, to: callerUid, reason: "household" });
      }
      units.delete(key);
    }

    // 4: fewest-first placement, biggest households first so they cannot land on top of a full list,
    //    then a stable order (units sorted by their first member).
    const ordered = [...units.values()].sort((a, b) => b.length - a.length || byStableOrder(a[0], b[0]));
    for (const unit of ordered) {
      const callerUid = callers.reduce((best, uid) => (counts[uid] < counts[best] ? uid : best), callers[0]);
      for (const member of unit) {
        current.set(member.id, callerUid);
        counts[callerUid] += 1;
        changes.push({ memberId: member.id, from: null, to: callerUid, reason: "placed" });
      }
    }
  } else {
    for (const [memberId, callerUid] of current) changes.push({ memberId, from: callerUid, to: null, reason: "caller_removed" });
    current.clear();
  }

  const assignments = [...current].map(([memberId, callerUid]) => ({ memberId, callerUid })).sort((a, b) => a.memberId.localeCompare(b.memberId));
  return { assignments, changes, counts };
}

/** Moves one member by hand; the household stays together only if the admin moves each person. */
export function moveMember(assignments: Assignment[], memberId: string, callerUid: string): Assignment[] {
  const rest = assignments.filter(a => a.memberId !== memberId);
  return [...rest, { memberId, callerUid }].sort((a, b) => a.memberId.localeCompare(b.memberId));
}

export function countByCaller(assignments: Assignment[], callers: string[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(callers.map(uid => [uid, 0]));
  for (const { callerUid } of assignments) if (callerUid in counts) counts[callerUid] += 1;
  return counts;
}

/** Largest minus smallest list; 0 or 1 means the split is as even as it can be. */
export function spread(counts: Record<string, number>): number {
  const values = Object.values(counts);
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}
