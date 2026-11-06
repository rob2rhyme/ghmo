import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { listAdmins } from "./admin";
import { ACTIVITY_AREAS, actionsInArea, areaOf, changedFields, recordHref, type ActivityArea, type Change } from "./activityLog";
import { DEFAULT_TIMEZONE } from "./events.shared";
import { parseEventDate } from "./zonedTime";
import { LABELLED_ACTIONS, activityActorName, activitySentence, type ActivityLog } from "./adminView";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgAuditLogsCollectionPath } from "./firestorePaths";

export const ACTIVITY_PAGE = 50;

export type ActivityFilters = { person?: string | null; area?: ActivityArea | null; fromMs?: number | null; toMs?: number | null; beforeMs?: number | null };

export type ActivityEntry = {
  id: string;
  createdAtMs: number | null;
  action: string;
  area: ActivityArea;
  text: string;
  detail?: string;
  person: string;
  personUid: string | null;
  role: string | null;
  changes: Change[];
  href: string | null;
  /** Super admins only (D82). */
  device?: { ip: string | null; userAgent: string | null };
};

const col = () => getAdminDb().collection(orgAuditLogsCollectionPath(COMMUNITY_SLUG));
const millis = (value: unknown): number | null => {
  const stamp = value as { toMillis?: () => number } | Date | number | null | undefined;
  if (stamp instanceof Date) return stamp.getTime();
  if (typeof stamp === "number") return stamp;
  return typeof stamp?.toMillis === "function" ? stamp.toMillis() : null;
};

function toEntry(doc: FirebaseFirestore.QueryDocumentSnapshot, superAdmin: boolean): ActivityEntry {
  const data = doc.data() as Record<string, unknown>;
  const action = String(data.action ?? data.type ?? "");
  const actor = (data.actor ?? null) as { uid?: string; name?: string; role?: string; roles?: string[] } | null;
  const resource = (data.resource ?? null) as { id?: string } | null;
  const meta = (data.meta ?? {}) as { ip?: string; userAgent?: string };
  const sentence = activitySentence({ ...(data as ActivityLog), action });
  return {
    id: doc.id,
    createdAtMs: millis(data.createdAt ?? data.timestamp),
    action,
    area: areaOf(action),
    text: sentence.text,
    ...(sentence.detail ? { detail: sentence.detail } : {}),
    person: activityActorName(actor, typeof data.role === "string" ? data.role : null),
    personUid: actor?.uid ?? null,
    role: actor?.roles?.[0] ?? actor?.role ?? null,
    changes: changedFields(data.before, data.after),
    href: recordHref({ action, resourceId: resource?.id ?? null }, { superAdmin }),
    ...(superAdmin ? { device: { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null } } : {})
  };
}

function base(filters: ActivityFilters): FirebaseFirestore.Query {
  let q: FirebaseFirestore.Query = col();
  if (filters.person) q = q.where("actor.uid", "==", filters.person);
  if (filters.fromMs) q = q.where("createdAt", ">=", Timestamp.fromMillis(filters.fromMs));
  // "Load older" continues strictly before the last entry shown; a "to" date includes that whole day.
  const before = filters.beforeMs ?? null;
  const to = filters.toMs ?? null;
  if (before !== null && (to === null || before <= to)) q = q.where("createdAt", "<", Timestamp.fromMillis(before));
  else if (to !== null) q = q.where("createdAt", "<=", Timestamp.fromMillis(to));
  return q.orderBy("createdAt", "desc");
}

/**
 * One page of the log, newest first (D84). An area alone is an `action in [...]` query per 30 actions, merged by time;
 * a person and an area together read that person's entries and keep the area's, so no three-field index is needed.
 */
export async function readActivity(filters: ActivityFilters, options: { superAdmin: boolean; limit?: number }): Promise<{ entries: ActivityEntry[]; nextBeforeMs: number | null }> {
  const limit = options.limit ?? ACTIVITY_PAGE;
  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (filters.area && !filters.person) {
    const actions = actionsInArea(filters.area, LABELLED_ACTIONS);
    const chunks = Array.from({ length: Math.ceil(actions.length / 30) }, (_, i) => actions.slice(i * 30, i * 30 + 30)).filter(chunk => chunk.length > 0);
    const snaps = await Promise.all(chunks.map(chunk => base(filters).where("action", "in", chunk).limit(limit + 1).get()));
    docs = snaps.flatMap(snap => snap.docs);
    if (filters.area === "other") {
      // "Other" also holds actions with no words yet; read recent entries and keep those outside every named area.
      const recent = await base(filters).limit(Math.max(200, limit * 4)).get();
      docs = [...docs, ...recent.docs.filter(doc => areaOf(String(doc.get("action") ?? "")) === "other")];
    }
  } else if (filters.area && filters.person) {
    let cursor = filters.beforeMs ?? null;
    for (let round = 0; round < 4 && docs.length <= limit; round += 1) {
      const snap = await base({ ...filters, beforeMs: cursor }).limit(200).get();
      docs.push(...snap.docs.filter(doc => areaOf(String(doc.get("action") ?? "")) === filters.area));
      if (snap.size < 200) break;
      cursor = millis(snap.docs[snap.size - 1].get("createdAt"));
    }
  } else {
    docs = (await base(filters).limit(limit + 1).get()).docs;
  }
  const unique = [...new Map(docs.map(doc => [doc.id, doc])).values()].sort((a, b) => (millis(b.get("createdAt")) ?? 0) - (millis(a.get("createdAt")) ?? 0));
  const page = unique.slice(0, limit);
  const more = unique.length > limit;
  const entries = page.map(doc => toEntry(doc, options.superAdmin));
  return { entries, nextBeforeMs: more ? (entries[entries.length - 1]?.createdAtMs ?? null) : null };
}

/** Everyone who can appear as the person of an entry: admins past and present, by sign-in id (D84). */
export async function activityPeople(): Promise<{ uid: string; name: string; active: boolean }[]> {
  const admins = await listAdmins(COMMUNITY_SLUG);
  return admins
    .map(admin => ({ uid: admin.authUid || admin.id, name: admin.name || admin.emailLower || "Unnamed admin", active: admin.status === "active" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;

/** The filters from a query string, or a plain-words problem (shared by the read and the download). */
export function activityFilters(params: URLSearchParams | Record<string, string | null | undefined>): ActivityFilters | { error: string } {
  const get = (key: string) => (params instanceof URLSearchParams ? params.get(key) : params[key]) || null;
  const person = get("person");
  const area = get("area");
  const from = get("from");
  const to = get("to");
  const before = get("before");
  if (person && !UID.test(person)) return { error: "That person wasn't found." };
  if (area && !(ACTIVITY_AREAS as readonly string[]).includes(area)) return { error: "That area wasn't found." };
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return { error: "Dates look like 2026-11-06." };
  const fromMs = from ? (parseEventDate(`${from}T00:00`, DEFAULT_TIMEZONE)?.getTime() ?? null) : null;
  const toStart = to ? (parseEventDate(`${to}T00:00`, DEFAULT_TIMEZONE)?.getTime() ?? null) : null;
  const toMs = toStart !== null ? toStart + 24 * 3600_000 - 1 : null;
  if (fromMs !== null && toMs !== null && fromMs > toMs) return { error: "The start date is after the end date." };
  const beforeMs = before && /^\d{1,15}$/.test(before) ? Number(before) : null;
  return { person, area: (area as ActivityArea | null) ?? null, fromMs, toMs, beforeMs };
}
