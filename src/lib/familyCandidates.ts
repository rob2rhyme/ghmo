import { memberDisplayName, type FamilyMember } from "./members";

/**
 * People listed as a member's family who aren't members themselves (owner request 2026-11-06, plan §28.8): the
 * officer picker offers them so a relative can be seated in one step. Built in the browser from contacts the unlocked
 * device has already decrypted; the server never sees a family list.
 */
export type FamilyCandidate = {
  /** Stable within one page view: the member's id and the entry's place in their family list. */
  key: string;
  name: string;
  relationship?: string;
  /** E.164, when the family entry has one. */
  phone?: string;
  ofMemberId: string;
  ofMemberName: string;
};

const sameName = (name: string) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function familyCandidates(members: { id: string; name?: string | null; emailLower?: string | null }[], families: Map<string, FamilyMember[] | undefined>): FamilyCandidate[] {
  const memberNames = new Set(members.map(member => sameName(member.name ?? "")).filter(Boolean));
  const seen = new Set<string>();
  const out: FamilyCandidate[] = [];
  for (const member of members) {
    (families.get(member.id) ?? []).forEach((entry, index) => {
      const name = entry.name?.trim();
      if (!name) return;
      const who = sameName(name);
      // Already on the member list under that name: they appear there, not here.
      if (memberNames.has(who)) return;
      // The same relative listed by two members (for example a parent of two siblings) is offered once.
      const dedupe = `${who}|${entry.phone ?? ""}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push({
        key: `${member.id}:${index}`,
        name,
        ...(entry.relationship?.trim() ? { relationship: entry.relationship.trim() } : {}),
        ...(entry.phone ? { phone: entry.phone } : {}),
        ofMemberId: member.id,
        ofMemberName: memberDisplayName(member)
      });
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** "Ram Rai (husband of Asha Rai)" or "Ram Rai (family of Asha Rai)". */
export function familyCandidateLabel(candidate: Pick<FamilyCandidate, "name" | "relationship" | "ofMemberName">): string {
  return `${candidate.name} (${candidate.relationship ? candidate.relationship.toLowerCase() : "family"} of ${candidate.ofMemberName})`;
}
