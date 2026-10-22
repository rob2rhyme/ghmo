/** Asks the server to send content-free "new activity" emails to opted-in admins. Never blocks or fails the caller. */
export function notifyActivity(kind: "chat" | "thread") {
  void fetch("/api/admin/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind })
  }).catch(() => undefined);
}
