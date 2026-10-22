/**
 * Notification emails say that something happened, never what. No titles, names, message text or
 * minutes content: email passes through providers and inboxes we don't control.
 */
export type NotificationKind = "chat" | "thread" | "minutes_submitted";

/** Kinds a browser may trigger (the server triggers the rest itself). */
export const CLIENT_NOTIFICATION_KINDS = ["chat", "thread"] as const;

const COPY: Record<NotificationKind, { subject: string; line: string; path: string }> = {
  chat: { subject: "New activity in Admin Chat", line: "There is new activity in Admin Chat.", path: "/admin/chat" },
  thread: { subject: "New activity in Plans & Issues", line: "There is new activity in Plans & Issues.", path: "/admin/comms" },
  minutes_submitted: { subject: "Minutes are waiting for approval", line: "Meeting minutes were submitted and need an approver.", path: "/admin/minutes?mode=records" }
};

export function notificationMessage(kind: NotificationKind, origin: string) {
  const copy = COPY[kind];
  return {
    subject: `GHMO: ${copy.subject}`,
    text: [
      copy.line,
      `Sign in to read it: ${origin}${copy.path}`,
      "",
      "You get this email because you turned on notifications. You can turn them off under Admin → Security."
    ].join("\n")
  };
}

export type NotifyCandidate = { uid: string; email?: string | null; status?: string; notifyEmail?: boolean };

/** Active admins who opted in and have an address, other than whoever caused the activity. */
export function pickRecipients(admins: NotifyCandidate[], actorUid: string): { uid: string; email: string }[] {
  return admins
    .filter(admin => admin.uid !== actorUid && admin.status === "active" && admin.notifyEmail === true && typeof admin.email === "string" && admin.email.includes("@"))
    .map(admin => ({ uid: admin.uid, email: admin.email as string }));
}
