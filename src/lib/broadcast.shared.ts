/**
 * Broadcast constants and types shared by the server rules (./broadcast) and the admin screens. Keep this
 * file free of Node imports: it is bundled for the browser.
 */
export type BroadcastStatus = "draft" | "pending_approval" | "approved" | "sending" | "sent" | "cancelled";

export const SUBJECT_MAX = 150;
export const BODY_MAX = 20_000;

/**
 * Who a broadcast goes to (plan §30, D91): everyone who agreed to email, or the members of one group.
 * Stored on the broadcast as `audience` ("all" or "group") plus `audienceGroupId`. Broadcasts saved
 * before groups existed have `audience: "all"` or nothing, and mean everyone.
 */
export type BroadcastAudience = { kind: "all" } | { kind: "group"; groupId: string };
export const AUDIENCE_ALL: BroadcastAudience = { kind: "all" };

/** The audience is optional so older callers mean everyone; it is part of what an approval covers. */
export type BroadcastContent = { subject: string; body: string; audience?: BroadcastAudience };

const GROUP_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The audience as hashed and compared: "all" or "group:<id>". */
export function audienceKey(audience: BroadcastAudience | undefined): string {
  return audience?.kind === "group" ? `group:${audience.groupId}` : "all";
}

/** Reads the stored (or posted) audience fields. Null when they don't make sense. */
export function readAudience(input: { audience?: unknown; audienceGroupId?: unknown }): BroadcastAudience | null {
  if (input.audience === undefined || input.audience === null || input.audience === "all") return AUDIENCE_ALL;
  if (input.audience === "group" && typeof input.audienceGroupId === "string" && GROUP_ID.test(input.audienceGroupId)) {
    return { kind: "group", groupId: input.audienceGroupId };
  }
  return null;
}

/** The stored fields for an audience. */
export function audienceFields(audience: BroadcastAudience | undefined): { audience: "all" | "group"; audienceGroupId: string | null } {
  return audience?.kind === "group" ? { audience: "group", audienceGroupId: audience.groupId } : { audience: "all", audienceGroupId: null };
}

/** Who a broadcast could go to now: how many can be emailed in all, and in each turned-on group. */
export type AudienceGroupOption = { id: string; name: string; count: number };
export type AudienceOptions = { all: number; groups: AudienceGroupOption[] };

/** "Everyone who agreed to email" or "Cooking team", for the screens and the activity log. */
export function audienceLabel(audience: BroadcastAudience | undefined, groupName?: string | null): string {
  if (audience?.kind !== "group") return "Everyone who agreed to email";
  return groupName?.trim() || "A group that no longer exists";
}

export type BroadcastAction = "submit" | "approve" | "withdraw" | "cancel";

// Posting an approved broadcast by hand to the Messenger group chats (plan §12, 9-D, decision D14).
export const MANUAL_CHANNELS = ["messenger_bod", "messenger_community"] as const;
export type ManualChannel = (typeof MANUAL_CHANNELS)[number];
export const MANUAL_CHANNEL_LABELS: Record<ManualChannel, string> = {
  messenger_bod: "BOD group chat",
  messenger_community: "Community group chat"
};

/** The text to paste into a chat: the subject as its own first line, a blank line, then the message. No email footer. */
export function messengerText(content: BroadcastContent): string {
  return `${content.subject}\n\n${content.body}`;
}
