import { csvCell } from "./memberExport";

/**
 * The activity log page (plan §29, Phase 22): pure rules shared by the read and export routes and the page. Areas group
 * actions by name (D84), `changedFields` turns before/after into "what changed" (D83), and the CSV is for super admins
 * (D85). The log itself is never changed (D86).
 */

export const ACTIVITY_AREAS = ["members", "events", "minutes", "broadcasts", "people", "calls", "security", "other"] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export const AREA_LABELS: Record<ActivityArea, string> = {
  members: "Members",
  events: "Events and tasks",
  minutes: "Minutes",
  broadcasts: "Broadcasts",
  people: "Positions and groups",
  calls: "Calls",
  security: "Admins and security",
  other: "Other"
};

const PREFIXES: [ActivityArea, RegExp][] = [
  ["members", /^members?_/],
  ["events", /^(event_|event_tasks_|task_template_|task_digest_)/],
  ["minutes", /^minutes_/],
  ["broadcasts", /^broadcast_/],
  ["people", /^(position_|group_)/],
  ["calls", /^(calling_tree_|call_)/],
  ["security", /^(login|logout|passkey_|totp_|admin_(?!chat_)|push_|e2ee_|activity_exported)/]
];

export function areaOf(action: string): ActivityArea {
  return PREFIXES.find(([, pattern]) => pattern.test(action))?.[0] ?? "other";
}

/** The actions of an area, from a list of known actions (for the `action in [...]` query). */
export function actionsInArea(area: ActivityArea, known: string[]): string[] {
  return [...new Set(known)].filter(action => areaOf(action) === area).sort();
}

export type Change = { field: string; before: string; after: string };

const SKIP = new Set(["id", "createdAt", "updatedAt", "path"]);

const plain = (value: unknown): string | null => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.length <= 10 && value.every(item => ["string", "number", "boolean"].includes(typeof item))) return value.join(", ");
  return null;
};

/** The plain fields that differ between before and after, in a stable order (D83). Nested objects are left out. */
export function changedFields(before: unknown, after: unknown, limit = 20): Change[] {
  const a = before && typeof before === "object" ? (before as Record<string, unknown>) : {};
  const b = after && typeof after === "object" ? (after as Record<string, unknown>) : {};
  const out: Change[] = [];
  for (const field of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (SKIP.has(field)) continue;
    const was = plain(a[field]);
    const now = plain(b[field]);
    if (was === null || now === null || was === now) continue;
    out.push({ field, before: was, after: now });
    if (out.length >= limit) break;
  }
  return out;
}

/** Where an entry's record lives in the admin area, while it can still exist (D83). Admin records are for super admins. */
export function recordHref(entry: { action: string; resourceId?: string | null }, options: { superAdmin: boolean }): string | null {
  const { action } = entry;
  const id = entry.resourceId && /^[A-Za-z0-9_-]{1,128}$/.test(entry.resourceId) ? encodeURIComponent(entry.resourceId) : null;
  if (/_deleted$|_removed$/.test(action)) return null;
  if (/^member_/.test(action) && id) return `/admin/members/${id}`;
  if (/^event_(created|updated)$/.test(action) && id) return `/admin/events/${id}/edit`;
  if (/^minutes_/.test(action) && id) return `/admin/minutes?mode=new&minutesId=${id}`;
  if (/^broadcast_/.test(action) && id) return `/admin/broadcasts/${id}`;
  if (/^group_/.test(action) && id) return `/admin/groups/${id}`;
  if (/^position_/.test(action)) return "/admin/positions";
  if (/^admin_(added|turned_off|turned_on|role_changed|renamed)$/.test(action) && options.superAdmin) return "/admin/admins";
  return null;
}

export type ActivityRow = { when: string; person: string; role: string; text: string; detail?: string; area: ActivityArea; ip?: string; userAgent?: string };

/** The download (D85): one row per entry; the address and browser columns only for super admins. */
export function activityCsv(rows: ActivityRow[], options: { withDevice: boolean }): string {
  const header = ["When", "Person", "Role", "What", "Detail", "Area", ...(options.withDevice ? ["Internet address", "Browser"] : [])];
  const lines = rows.map(row =>
    [row.when, row.person, row.role, row.text, row.detail ?? "", AREA_LABELS[row.area], ...(options.withDevice ? [row.ip ?? "", row.userAgent ?? ""] : [])].map(cell => csvCell(cell)).join(",")
  );
  return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}
