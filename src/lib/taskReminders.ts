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
