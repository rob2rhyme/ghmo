import "server-only";
import { COMMUNITY_SLUG } from "./community";
import { queryAllEvents } from "./events";
import { getAdminDb } from "./firebaseAdmin";
import { orgBroadcastsCollectionPath, orgGroupsCollectionPath, orgMembersCollectionPath, orgMinutesCollectionPath, orgPositionTermsCollectionPath, orgPositionsCollectionPath } from "./firestorePaths";
import { formatShortDate, toDate } from "./format";
import { memberDisplayName } from "./members";
import { POSITION_TIME_ZONE, termStatus, todayIn } from "./positions";
import { statusBadge } from "./statusBadges";
import type { SearchEntry } from "./adminSearch";

const db = () => getAdminDb();
const millis = (value: unknown) => toDate(value as never)?.getTime();
const day = (value: unknown) => {
  const ms = millis(value);
  return ms ? formatShortDate(ms) : "";
};
const STATUS_WORDS: Record<string, string> = { draft: "Draft", submitted: "Waiting for approval", approved: "Approved", published: "Published", archived: "Archived" };

/**
 * The palette's index (plan §27, D72): plain-text names, titles, dates and statuses only. Every read uses select(), so
 * no other field (phone envelopes, notes, minutes text) is ever read for it, let alone sent to the browser.
 */
export async function buildSearchIndex(now: Date = new Date()): Promise<SearchEntry[]> {
  const [members, events, minutes, groups, positions, terms, broadcasts] = await Promise.all([
    db().collection(orgMembersCollectionPath(COMMUNITY_SLUG)).select("name", "emailLower", "status").get(),
    queryAllEvents(db(), q => q.select("title", "startsAt", "status")),
    db().collection(orgMinutesCollectionPath(COMMUNITY_SLUG)).select("eventTitle", "eventDate", "status").get(),
    db().collection(orgGroupsCollectionPath(COMMUNITY_SLUG)).select("name", "active").get(),
    db().collection(orgPositionsCollectionPath(COMMUNITY_SLUG)).select("title", "active").get(),
    db().collection(orgPositionTermsCollectionPath(COMMUNITY_SLUG)).select("positionId", "memberId", "startsOn", "endsOn").get(),
    db().collection(orgBroadcastsCollectionPath(COMMUNITY_SLUG)).select("subject", "status", "updatedAt").get()
  ]);

  const memberNames = new Map<string, string>();
  const entries: SearchEntry[] = [];
  for (const doc of members.docs) {
    const emailLower = String(doc.get("emailLower") ?? "");
    const name = memberDisplayName({ name: doc.get("name") as string | null, emailLower });
    memberNames.set(doc.id, name);
    entries.push({ kind: "member", id: doc.id, title: name, detail: emailLower.includes("@") && name !== emailLower ? emailLower : undefined, badge: doc.get("status") === "active" ? undefined : "Turned off" });
  }
  for (const doc of events) {
    const status = String(doc.get("status") ?? "draft");
    entries.push({ kind: "event", id: doc.id, title: String(doc.get("title") || "Untitled event"), detail: day(doc.get("startsAt")) || "No date yet", badge: status === "published" ? undefined : STATUS_WORDS[status], sortMs: millis(doc.get("startsAt")) });
  }
  for (const doc of minutes.docs) {
    const status = String(doc.get("status") ?? "draft");
    entries.push({ kind: "minutes", id: doc.id, title: String(doc.get("eventTitle") || "Untitled meeting"), detail: [day(doc.get("eventDate")), STATUS_WORDS[status]].filter(Boolean).join(" · "), sortMs: millis(doc.get("eventDate")) });
  }
  for (const doc of groups.docs) {
    entries.push({ kind: "group", id: doc.id, title: String(doc.get("name") || "Untitled group"), badge: doc.get("active") === false ? "Turned off" : undefined });
  }
  const today = todayIn(now, POSITION_TIME_ZONE);
  const holders = new Map<string, string[]>();
  for (const doc of terms.docs) {
    const term = { startsOn: String(doc.get("startsOn") ?? ""), endsOn: (doc.get("endsOn") as string | null) ?? null };
    if (!term.startsOn || termStatus(term, today) !== "current") continue;
    const positionId = String(doc.get("positionId") ?? "");
    const name = memberNames.get(String(doc.get("memberId") ?? ""));
    if (positionId && name) holders.set(positionId, [...(holders.get(positionId) ?? []), name]);
  }
  for (const doc of positions.docs) {
    entries.push({ kind: "position", id: doc.id, title: String(doc.get("title") || doc.id), detail: holders.get(doc.id)?.join(", ") || "Vacant", badge: doc.get("active") === false ? "Turned off" : undefined });
  }
  for (const doc of broadcasts.docs) {
    const status = String(doc.get("status") ?? "draft");
    entries.push({ kind: "broadcast", id: doc.id, title: String(doc.get("subject") || "Untitled broadcast"), detail: statusBadge("broadcast", status).label, sortMs: millis(doc.get("updatedAt")) });
  }
  return entries;
}
