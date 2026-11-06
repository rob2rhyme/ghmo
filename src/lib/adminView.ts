/** Small, pure helpers for how the admin screens present people, times and numbers. */
import { formatShortDate as formatDate } from "./format";

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

type ActivityActor = { name?: string | null; role?: string | null; roles?: readonly string[] | null; actor?: unknown } | string | null | undefined;

export type ActivityLog = AuditLike & { actor?: ActivityActor; role?: string | null };

/** The person in a sentence: their name, else their role ("A super admin"), else "Someone". */
export function activityActorName(actor: ActivityActor, fallbackRole?: string | null): string {
  if (actor && typeof actor === "object" && actor.actor && typeof actor.actor === "object") {
    return activityActorName(actor.actor as ActivityActor, fallbackRole);
  }
  const rawName = typeof actor === "string" ? actor : actor?.name;
  const name = (rawName ?? "").trim();
  if (name && !name.includes("@")) return name;
  const role = (actor && typeof actor === "object" ? actor.roles?.[0] || actor.role : null) || fallbackRole || "";
  if (role === "super_admin") return "A super admin";
  if (role === "admin") return "An admin";
  if (role === "developer") return "A developer";
  if (role === "system") return "The system";
  return "Someone";
}

/**
 * What each audit action means, as the end of a sentence ("Alice … added a passkey"). `detail: true`
 * keeps the entry's summary as a second line when it adds something (a device name, a count, a title).
 */
const ACTIVITY: Record<string, { verb: string; detail?: boolean }> = {
  login_start: { verb: "asked for a sign-in email" },
  login_dev: { verb: "signed in (test mode)" },
  logout: { verb: "signed out" },
  passkey_registered: { verb: "added a passkey", detail: true },
  passkey_pending_approval: { verb: "added a passkey that needs approval", detail: true },
  passkey_approved: { verb: "approved a passkey" },
  passkey_removed: { verb: "removed a passkey" },
  totp_enrolled: { verb: "set up an authenticator app" },
  totp_reset: { verb: "reset an admin's authenticator app" },
  totp_login_failed: { verb: "entered a wrong authenticator code" },
  totp_locked: { verb: "had their authenticator locked after too many wrong codes" },
  totp_recovery_codes_regenerated: { verb: "made new recovery codes" },
  admin_bootstrap: { verb: "set up the first super admin account" },
  minutes_created: { verb: "saved new minutes", detail: true },
  minutes_updated: { verb: "edited minutes" },
  minutes_submitted: { verb: "submitted minutes for approval" },
  minutes_approved: { verb: "approved minutes" },
  minutes_reopened: { verb: "reopened approved minutes" },
  minutes_returned_to_draft: { verb: "returned minutes to draft" },
  event_created: { verb: "created an event", detail: true },
  event_updated: { verb: "updated an event", detail: true },
  event_deleted: { verb: "deleted an event", detail: true },
  member_created: { verb: "added a member" },
  member_updated: { verb: "updated a member" },
  member_note_added: { verb: "added a note to a member profile", detail: true },
  member_note_deleted: { verb: "deleted a note from a member profile", detail: true },
  members_imported: { verb: "imported members", detail: true },
  position_created: { verb: "added an officer position", detail: true },
  position_updated: { verb: "changed an officer position", detail: true },
  position_term_added: { verb: "seated an officer", detail: true },
  position_term_updated: { verb: "changed an officer's term", detail: true },
  position_term_removed: { verb: "removed an officer term", detail: true },
  group_created: { verb: "created a member group", detail: true },
  group_updated: { verb: "changed a member group", detail: true },
  group_deleted: { verb: "deleted a member group", detail: true },
  group_members_changed: { verb: "changed who is in a member group", detail: true },
  event_task_created: { verb: "added an event task", detail: true },
  event_task_updated: { verb: "changed an event task", detail: true },
  event_task_done: { verb: "finished an event task", detail: true },
  event_task_reopened: { verb: "reopened an event task", detail: true },
  event_task_deleted: { verb: "removed an event task", detail: true },
  event_tasks_template_applied: { verb: "added tasks from a template", detail: true },
  task_template_created: { verb: "saved a task template", detail: true },
  task_template_updated: { verb: "changed a task template", detail: true },
  task_template_deleted: { verb: "deleted a task template", detail: true },
  event_tasks_reminded: { verb: "sent task reminders", detail: true },
  task_digest_switched: { verb: "switched the daily task digest", detail: true },
  task_digest_run: { verb: "ran the daily task digest", detail: true },
  calling_tree_updated: { verb: "updated the calling tree", detail: true },
  call_campaign_created: { verb: "opened a call campaign", detail: true },
  call_campaign_closed: { verb: "closed a call campaign", detail: true },
  call_campaign_reminded: { verb: "reminded callers", detail: true },
  call_campaign_exported: { verb: "downloaded a call campaign", detail: true },
  members_exported: { verb: "downloaded the member list", detail: true },
  member_deleted: { verb: "deleted a member", detail: true },
  push_device_removed: { verb: "turned off a push device", detail: true },
  push_switched: { verb: "switched push notifications for the site", detail: true },
  admin_added: { verb: "added an admin", detail: true },
  admin_turned_off: { verb: "turned an admin off", detail: true },
  admin_turned_on: { verb: "turned an admin on", detail: true },
  admin_role_changed: { verb: "changed an admin's role", detail: true },
  admin_renamed: { verb: "fixed an admin's name", detail: true },
  call_manner_cleared: { verb: "cleared the rating on a call", detail: true },
  call_attempt_recorded: { verb: "logged a call", detail: true },
  broadcast_created: { verb: "started a broadcast" },
  broadcast_updated: { verb: "edited a broadcast" },
  broadcast_edited_returned_to_draft: { verb: "edited a broadcast (back to draft)" },
  broadcast_submitted: { verb: "submitted a broadcast for approval" },
  broadcast_approved: { verb: "approved a broadcast" },
  broadcast_withdrawn: { verb: "withdrew a broadcast" },
  broadcast_cancelled: { verb: "canceled a broadcast" },
  broadcast_sending_started: { verb: "started sending a broadcast" },
  broadcast_test_sent: { verb: "sent a test broadcast" },
  broadcast_posted_manually: { verb: "posted a broadcast by hand", detail: true },
  comms_thread_created: { verb: "started a topic in Plans & Issues" },
  comms_thread_closed: { verb: "closed a topic in Plans & Issues" },
  comms_comment_created: { verb: "commented in Plans & Issues" },
  comms_conclusion_proposed: { verb: "proposed a conclusion in Plans & Issues" },
  comms_conclusion_vote: { verb: "voted on a conclusion in Plans & Issues" },
  admin_chat_message_sent: { verb: "sent a message in Admin chat" },
  timeline_created: { verb: "added to the Gumba Project timeline" },
  timeline_updated: { verb: "updated the Gumba Project timeline" },
  timeline_entry_updated: { verb: "updated the Gumba Project timeline" },
  home_blocks_updated: { verb: "updated the homepage" },
  doc_generated: { verb: "made a document", detail: true },
  reconcile: { verb: "synced donations" },
  e2ee_enabled: { verb: "turned on encryption", detail: true },
  e2ee_device_registered: { verb: "set up a device for encryption", detail: true },
  e2ee_device_approved: { verb: "approved a device", detail: true },
  e2ee_device_recovered: { verb: "restored a device with the recovery key", detail: true },
  e2ee_device_withdrawn: { verb: "removed a device", detail: true },
  e2ee_rotated: { verb: "made new encryption keys" },
  e2ee_recovery_replaced: { verb: "replaced the recovery key" },
  e2ee_roster_sealed: { verb: "sealed the device list" },
  e2ee_record_migrated: { verb: "encrypted existing records", detail: true }
};

/** Whole sentences for things nobody in particular did. */
const SYSTEM_ACTIVITY: Record<string, string> = {
  webhook_received: "A donation update arrived from GoFundMe",
  reconcile: "Donations were synced"
};

function signInVerb(summary: string): string {
  if (/recovery code/i.test(summary)) return "signed in with a recovery code";
  if (/^passkey/i.test(summary)) return "signed in with a passkey";
  if (/^authenticator/i.test(summary)) return "signed in with the authenticator app";
  if (/email|magic link/i.test(summary)) return "signed in with an email link";
  return "signed in";
}

/** "Sita's iPhone (magic_link)" -> "Sita's iPhone"; "Created event: Picnic" -> "Picnic". */
function cleanDetail(summary: string): string {
  return summary
    .replace(/\s*\([a-z_]+\)$/, "")
    .replace(/^(created|updated|deleted) event:\s*/i, "")
    .replace(/^minutes for\s+/i, "")
    .replace(/^end-to-end encryption enabled;\s*/i, "")
    .replace(/^recovery key held by/i, "Recovery key held by")
    .trim();
}

/**
 * A plain sentence for an audit entry ("Alice Rai signed in with a passkey"), plus an optional detail
 * line. Unknown actions fall back to the entry's own summary.
 */
export function activitySentence(log: ActivityLog): { text: string; detail?: string } {
  const action = log.action || log.type || "";
  const summary = (log.summary || log.resource?.summary || "").trim();
  const hasActor = Boolean(log.actor || log.role);
  if (!hasActor && SYSTEM_ACTIVITY[action]) return { text: SYSTEM_ACTIVITY[action] };

  const who = activityActorName(log.actor, log.role);
  if (action === "login") return { text: `${who} ${signInVerb(summary)}` };

  const known = ACTIVITY[action];
  if (!known) return { text: auditTitle(log) };
  const detail = known.detail ? cleanDetail(summary) : "";
  const generic = !detail || detail.toLowerCase() === "passkey" || detail.toLowerCase() === humanizeAction(action).toLowerCase();
  return generic ? { text: `${who} ${known.verb}` } : { text: `${who} ${known.verb}`, detail };
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

/** "Dec 12, 2026", or "Date unknown" (wraps src/lib/format.ts so every page formats dates the same way). */
export function formatShortDate(ms: number | null | undefined): string {
  return (ms && formatDate(ms)) || "Date unknown";
}
