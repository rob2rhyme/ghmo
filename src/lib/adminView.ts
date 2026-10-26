/** Small, pure helpers for how the admin screens present people, times and numbers. */

export function firstName(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** "Robin Thapa" -> "RT". Falls back to a single letter, then to "A". */
export function initialsOf(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "A";
  const letters = words.length === 1 ? words[0].slice(0, 1) : words[0].slice(0, 1) + words[words.length - 1].slice(0, 1);
  return letters.toUpperCase();
}

export function roleLabel(roles?: readonly string[] | null): string {
  return roles?.includes("super_admin") ? "Super admin" : "Admin";
}

/** "passkey_registered" -> "Passkey registered". */
export function humanizeAction(action?: string | null): string {
  const text = (action ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

type AuditLike = {
  summary?: string;
  type?: string;
  action?: string;
  resource?: { summary?: string } | null;
};

/** Real audit entries keep their description in `resource.summary` and their kind in `action`. */
export function auditTitle(log: AuditLike): string {
  return log.summary || log.resource?.summary || humanizeAction(log.action) || humanizeAction(log.type) || "Activity";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function relativeTime(thenMs: number | null | undefined, nowMs: number): string {
  if (!thenMs || !Number.isFinite(thenMs)) return "";
  const diff = nowMs - thenMs;
  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} d ago`;
  return new Date(thenMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Whole percent of `goal` reached, 0..100, or null when there is no goal to compare with. */
export function percentOf(value: number | undefined, goal: number | undefined): number | null {
  if (!goal || goal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((value ?? 0) / goal) * 100)));
}

export function formatMoney(amount: number | undefined): string {
  return `$${(amount ?? 0).toLocaleString("en-US")}`;
}

export function formatShortDate(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date unavailable";
}
