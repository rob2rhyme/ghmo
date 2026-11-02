/**
 * One label and one colour per state, used everywhere a status badge appears (docs/UI_STYLE.md).
 * Colours: draft/not started → secondary; waiting for someone → warning; done/approved/live → success;
 * closed or not needed → secondary; cancelled/failed/overdue → destructive.
 */
import type { BadgeVariant } from "@/src/components/ui/badge";

export type StatusBadge = { label: string; variant: BadgeVariant };

const MINUTES: Record<string, StatusBadge> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Waiting for approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" }
};

const BROADCAST: Record<string, StatusBadge> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_approval: { label: "Waiting for approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  sending: { label: "Sending", variant: "warning" },
  sent: { label: "Sent", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" }
};

const TOPIC: Record<string, StatusBadge> = {
  open: { label: "Open", variant: "success" },
  closing: { label: "Closing", variant: "warning" },
  closed: { label: "Closed", variant: "secondary" }
};

const EVENT: Record<string, StatusBadge> = {
  draft: { label: "Draft", variant: "secondary" },
  published: { label: "Published", variant: "success" },
  archived: { label: "Archived", variant: "secondary" }
};

const CAMPAIGN: Record<string, StatusBadge> = {
  open: { label: "Open", variant: "success" },
  closed: { label: "Closed", variant: "secondary" }
};

const ACTION_ITEM: Record<string, StatusBadge> = {
  open: { label: "Open", variant: "secondary" },
  overdue: { label: "Overdue", variant: "destructive" },
  done: { label: "Done", variant: "success" },
  dropped: { label: "Not needed", variant: "secondary" }
};

/** Call outcomes: reached is done; anything still to try is waiting; ended without reaching is secondary. */
const CALL_OUTCOME: Record<string, StatusBadge> = {
  reached: { label: "Reached", variant: "success" },
  voicemail: { label: "Left voicemail", variant: "warning" },
  no_answer: { label: "No answer", variant: "warning" },
  callback: { label: "Call back later", variant: "warning" },
  wrong_number: { label: "Wrong number", variant: "secondary" },
  declined: { label: "Declined", variant: "secondary" },
  none: { label: "Not called yet", variant: "secondary" }
};

const KINDS = {
  minutes: MINUTES,
  broadcast: BROADCAST,
  topic: TOPIC,
  event: EVENT,
  campaign: CAMPAIGN,
  actionItem: ACTION_ITEM,
  callOutcome: CALL_OUTCOME
} as const;

export type StatusKind = keyof typeof KINDS;

/** The badge for a status; unknown values show as a neutral badge with a readable label. */
export function statusBadge(kind: StatusKind, status: string | null | undefined): StatusBadge {
  const key = status || (kind === "callOutcome" ? "none" : "draft");
  const known = (KINDS[kind] as Record<string, StatusBadge>)[key];
  if (known) return known;
  const label = key.replace(/[_-]+/g, " ");
  return { label: label.charAt(0).toUpperCase() + label.slice(1), variant: "outline" };
}
