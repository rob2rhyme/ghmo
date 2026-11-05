import { isOverdue, sortTasks, type EventTask } from "./eventTasks";
import { formatShortDate } from "./format";
import { memberDisplayName, memberEmailState, type MemberEmailState } from "./members";

/**
 * Pure rules for reminding the people who own an event's tasks (plan §16, 12-A). No I/O, so they are unit tested
 * alone. Only members who may be emailed (`memberEmailState` is "ready") ever get a reminder; everyone else is listed
 * so an admin can phone them. The send path re-reads each member's consent when it sends, so a stale preview can
 * never email someone who has since opted out.
 */

/** One reminder per person per event in this time. */
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A claim younger than this is a send still in progress, so it blocks a second one. */
export const CLAIM_IN_FLIGHT_MS = 3 * 60 * 1000;
export const MAX_REMINDERS_PER_SEND = 50;
/** An admin may send this many times an hour. */
export const REMINDER_SENDS_PER_HOUR = 10;

export type ReminderMode = "all" | "overdue";

type TaskIn = Pick<EventTask, "id" | "title" | "dueOn" | "status" | "groupId" | "memberIds" | "order">;
type GroupIn = { id: string; leadMemberId: string | null };
export type ReminderMember = {
  name?: string | null;
  emailLower?: string;
  status?: string;
  emailConsent?: { source?: unknown } | null;
  emailOptOutAt?: unknown;
  emailBounced?: unknown;
};
export type ReminderHistory = { lastSentAt?: Date | null; claimedAt?: Date | null };

export type ReminderLine = { title: string; dueOn: string | null; overdue: boolean };
export type CannotEmailReason = MemberEmailState | "missing";

export type ReminderPlan = {
  /** Will be emailed now, with the tasks their email lists. */
  recipients: { memberId: string; name: string; lines: ReminderLine[] }[];
  /** Own tasks but can't be emailed; the admin can phone them. */
  cannotEmail: { memberId: string; name: string; reason: CannotEmailReason }[];
  /** Were reminded in the last 24 hours (or a send is under way). */
  recentlyReminded: { memberId: string; name: string }[];
  /** Matching open tasks that nobody can be reminded about: no named person and no group lead. */
  unassigned: number;
  /** Eligible people beyond MAX_REMINDERS_PER_SEND; they stay unreminded for the next send. */
  more: number;
};

/** The people a task is for: those named on it, plus the lead of its group (never the whole group). */
export function taskOwners(task: Pick<TaskIn, "groupId" | "memberIds">, groups: GroupIn[]): string[] {
  const owners = new Set(task.memberIds);
  const lead = task.groupId ? groups.find(group => group.id === task.groupId)?.leadMemberId : null;
  if (lead) owners.add(lead);
  return [...owners];
}

export function planReminders(input: {
  tasks: TaskIn[];
  groups: GroupIn[];
  members: Map<string, ReminderMember>;
  history: Map<string, ReminderHistory>;
  mode: ReminderMode;
  /** Today in the organization's time zone, "YYYY-MM-DD". */
  today: string;
  now: Date;
}): ReminderPlan {
  const matching = sortTasks(input.tasks.filter(task => task.status === "open" && (input.mode === "all" || isOverdue(task, input.today))));
  const byPerson = new Map<string, ReminderLine[]>();
  let unassigned = 0;
  for (const task of matching) {
    const owners = taskOwners(task, input.groups);
    if (owners.length === 0) {
      unassigned += 1;
      continue;
    }
    for (const memberId of owners) {
      const lines = byPerson.get(memberId) ?? [];
      lines.push({ title: task.title, dueOn: task.dueOn, overdue: isOverdue(task, input.today) });
      byPerson.set(memberId, lines);
    }
  }

  const recipients: ReminderPlan["recipients"] = [];
  const cannotEmail: ReminderPlan["cannotEmail"] = [];
  const recentlyReminded: ReminderPlan["recentlyReminded"] = [];
  for (const [memberId, lines] of byPerson) {
    const member = input.members.get(memberId);
    const name = member ? memberDisplayName({ name: member.name, emailLower: member.emailLower }) : "A removed member";
    if (!member) {
      cannotEmail.push({ memberId, name, reason: "missing" });
      continue;
    }
    const state = memberEmailState(member);
    if (state !== "ready") {
      cannotEmail.push({ memberId, name, reason: state });
      continue;
    }
    const history = input.history.get(memberId);
    const sentRecently = history?.lastSentAt && input.now.getTime() - history.lastSentAt.getTime() < REMINDER_COOLDOWN_MS;
    const inFlight = history?.claimedAt && input.now.getTime() - history.claimedAt.getTime() < CLAIM_IN_FLIGHT_MS;
    if (sentRecently || inFlight) {
      recentlyReminded.push({ memberId, name });
      continue;
    }
    recipients.push({ memberId, name, lines });
  }

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  recipients.sort(byName);
  cannotEmail.sort(byName);
  recentlyReminded.sort(byName);
  return {
    recipients: recipients.slice(0, MAX_REMINDERS_PER_SEND),
    cannotEmail,
    recentlyReminded,
    unassigned,
    more: Math.max(0, recipients.length - MAX_REMINDERS_PER_SEND)
  };
}

/** Plain words for why someone can't be emailed, for the preview. */
export function cannotEmailLabel(reason: CannotEmailReason): string {
  switch (reason) {
    case "no_email":
      return "has no email (phone them)";
    case "no_consent":
      return "has not agreed to emails";
    case "opted_out":
      return "asked not to be emailed";
    case "bounced":
      return "their address bounced";
    case "inactive":
      return "is disabled";
    case "missing":
      return "is no longer on the list";
    default:
      return "can't be emailed";
  }
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The fixed reminder: this person's own open tasks for the event, nothing else. The footer and unsubscribe link are added by the sender. */
export function reminderEmail(input: { eventTitle: string; eventDay: string | null; recipientName: string; lines: ReminderLine[] }): { subject: string; text: string } {
  const title = oneLine(input.eventTitle) || "your event";
  const first = oneLine(input.recipientName).split(" ")[0];
  const when = input.eventDay ? ` (${formatShortDate(input.eventDay, { timeZone: "UTC" })})` : "";
  const lines = input.lines.map(line => {
    const due = line.dueOn ? `due ${formatShortDate(line.dueOn, { timeZone: "UTC" })}${line.overdue ? ", overdue" : ""}` : "no due date";
    return `- ${oneLine(line.title)} (${due})`;
  });
  return {
    subject: `Reminder: your tasks for ${title}`,
    text: [
      `Hello ${first || "there"},`,
      "",
      `This is a reminder about your tasks for ${title}${when}:`,
      "",
      ...lines,
      "",
      "If you can't do one of these, please tell the person who gave it to you."
    ].join("\n")
  };
}

// ---- The automatic daily digest (plan §16, 12-B) ----------------------------------------------------------------

/** One digest per person per day; a little under 24 hours so a slightly early run the next day still counts. */
export const DIGEST_COOLDOWN_MS = 20 * 60 * 60 * 1000;
/** Overdue tasks of events that ended longer ago than this are left alone: the moment has passed. */
export const DIGEST_EVENT_LOOKBACK_DAYS = 7;
/** At most this many digests a day, and never more than half of the day's email limit, so broadcasts keep room. */
export const MAX_DIGESTS_PER_DAY = 50;

/** How many digests may go out today: half the daily limit at most, 50 at most, and no more than what is left. */
export function digestCap(input: { dailyLimit: number; sentToday: number }): number {
  return Math.max(0, Math.min(MAX_DIGESTS_PER_DAY, Math.floor(input.dailyLimit / 2), input.dailyLimit - input.sentToday));
}

export type DigestEvent = { id: string; title: string; day: string | null };
export type DigestSection = { eventId: string; eventTitle: string; eventDay: string | null; lines: ReminderLine[] };

export type DigestPlan = {
  /** Most overdue tasks first, then by name. Cut at the cap. */
  recipients: { memberId: string; name: string; overdueCount: number; sections: DigestSection[] }[];
  /** People with overdue tasks who can't be emailed (no email, no consent, opted out, bounced, disabled, removed). */
  cannotEmail: number;
  /** Eligible people left for tomorrow because of the cap. */
  deferred: number;
  /** Overdue tasks nobody can be reminded about. */
  unassigned: number;
};

/**
 * Who gets today's digest: each person with overdue tasks in recent or upcoming events gets one email with all of
 * them, grouped by event. Same consent rules as a manual reminder, and a person already sent a digest in the last
 * 20 hours is skipped.
 */
export function planDigest(input: {
  events: DigestEvent[];
  tasks: (TaskIn & { eventId: string })[];
  groups: GroupIn[];
  members: Map<string, ReminderMember>;
  /** When each person was last sent a digest. */
  history: Map<string, ReminderHistory>;
  today: string;
  now: Date;
  cap: number;
}): DigestPlan {
  const oldest = addDaysIso(input.today, -DIGEST_EVENT_LOOKBACK_DAYS);
  const events = new Map(input.events.filter(event => !event.day || event.day >= oldest).map(event => [event.id, event]));
  const bySection = new Map<string, Map<string, ReminderLine[]>>();
  let unassigned = 0;
  for (const task of sortTasks(input.tasks)) {
    const event = events.get(task.eventId);
    if (!event || task.status !== "open" || !isOverdue(task, input.today)) continue;
    const owners = taskOwners(task, input.groups);
    if (owners.length === 0) {
      unassigned += 1;
      continue;
    }
    for (const memberId of owners) {
      const sections = bySection.get(memberId) ?? new Map<string, ReminderLine[]>();
      const lines = sections.get(event.id) ?? [];
      lines.push({ title: task.title, dueOn: task.dueOn, overdue: true });
      sections.set(event.id, lines);
      bySection.set(memberId, sections);
    }
  }

  const recipients: DigestPlan["recipients"] = [];
  let cannotEmail = 0;
  for (const [memberId, sections] of bySection) {
    const member = input.members.get(memberId);
    if (!member || memberEmailState(member) !== "ready") {
      cannotEmail += 1;
      continue;
    }
    const history = input.history.get(memberId);
    const sentRecently = history?.lastSentAt && input.now.getTime() - history.lastSentAt.getTime() < DIGEST_COOLDOWN_MS;
    const inFlight = history?.claimedAt && input.now.getTime() - history.claimedAt.getTime() < CLAIM_IN_FLIGHT_MS;
    if (sentRecently || inFlight) continue;
    const ordered: DigestSection[] = [...sections]
      .map(([eventId, lines]) => ({ eventId, eventTitle: events.get(eventId)?.title ?? "an event", eventDay: events.get(eventId)?.day ?? null, lines }))
      .sort((a, b) => (a.eventDay ?? "9999-12-31").localeCompare(b.eventDay ?? "9999-12-31") || a.eventTitle.localeCompare(b.eventTitle));
    recipients.push({ memberId, name: memberDisplayName({ name: member.name, emailLower: member.emailLower }), overdueCount: ordered.reduce((n, section) => n + section.lines.length, 0), sections: ordered });
  }
  recipients.sort((a, b) => b.overdueCount - a.overdueCount || a.name.localeCompare(b.name));
  const cap = Math.max(0, input.cap);
  return { recipients: recipients.slice(0, cap), cannotEmail, deferred: Math.max(0, recipients.length - cap), unassigned };
}

/** A calendar date plus a number of days, for "7 days ago" without a time zone in the way. */
function addDaysIso(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The fixed digest: this person's overdue tasks, grouped by event. The footer and unsubscribe link are added by the sender. */
export function digestEmail(input: { recipientName: string; sections: DigestSection[] }): { subject: string; text: string } {
  const first = oneLine(input.recipientName).split(" ")[0];
  const blocks = input.sections.flatMap(section => {
    const when = section.eventDay ? ` (${formatShortDate(section.eventDay, { timeZone: "UTC" })})` : "";
    return [
      `${oneLine(section.eventTitle)}${when}`,
      ...section.lines.map(line => `- ${oneLine(line.title)} (${line.dueOn ? `was due ${formatShortDate(line.dueOn, { timeZone: "UTC" })}` : "no due date"})`),
      ""
    ];
  });
  return {
    subject: "Reminder: tasks that are overdue",
    text: [`Hello ${first || "there"},`, "", "These tasks of yours are past their due date:", "", ...blocks, "If you can't do one of these, please tell the person who gave it to you."].join("\n")
  };
}
