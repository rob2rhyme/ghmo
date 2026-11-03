/**
 * Broadcast constants and types shared by the server rules (./broadcast) and the admin screens. Keep this
 * file free of Node imports: it is bundled for the browser.
 */
export type BroadcastStatus = "draft" | "pending_approval" | "approved" | "sending" | "sent" | "cancelled";

export const SUBJECT_MAX = 150;
export const BODY_MAX = 20_000;

export type BroadcastContent = { subject: string; body: string };

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
