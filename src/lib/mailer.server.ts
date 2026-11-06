import "server-only";

/**
 * Sends plain-text email through Resend's HTTP API (free tier). Does nothing unless both
 * RESEND_API_KEY and NOTIFY_FROM_EMAIL are set, so notifications are simply off by default.
 * MAIL_API_URL exists so tests can point it at a local stub.
 */
const DEFAULT_URL = "https://api.resend.com/emails";

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

export async function sendMail(message: { to: string; subject: string; text: string; headers?: Record<string, string> }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!isMailConfigured()) return false;
  try {
    const res = await fetchImpl(process.env.MAIL_API_URL || DEFAULT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: [message.to], subject: message.subject, text: message.text, ...(message.headers ? { headers: message.headers } : {}) }),
      signal: AbortSignal.timeout(5000)
    });
    // A refused send (bad key, unverified domain, rate limit) used to leave no trace at all. Only the status is logged.
    if (!res.ok) console.error("Notification email refused", res.status);
    return res.ok;
  } catch (error) {
    // Never log the address or message.
    console.error("Notification email failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}

export type BatchMessage = { to: string; subject: string; text: string; headers?: Record<string, string> };
export type BatchResult = { ok: true; ids: string[] } | { ok: false; status?: number };

/**
 * Sends up to 100 messages in one request (Resend's batch endpoint), so a broadcast stays within the
 * provider's request-rate limit. The idempotency key makes a retried request (for example after a
 * timeout or a crashed server function) return the first result instead of sending again.
 */
export async function sendMailBatch(messages: BatchMessage[], idempotencyKey: string, fetchImpl: typeof fetch = fetch): Promise<BatchResult> {
  if (!isMailConfigured() || messages.length === 0 || messages.length > 100) return { ok: false };
  try {
    const res = await fetchImpl(`${process.env.MAIL_API_URL || DEFAULT_URL}/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(
        messages.map(message => ({
          from: process.env.NOTIFY_FROM_EMAIL,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.headers ? { headers: message.headers } : {})
        }))
      ),
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) {
      console.error("Broadcast batch refused", res.status);
      return { ok: false, status: res.status };
    }
    const data = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    return { ok: true, ids: (data?.data ?? []).map(item => item.id ?? "") };
  } catch (error) {
    // Never log addresses or message text.
    console.error("Broadcast batch failed", error instanceof Error ? error.name : "unknown");
    return { ok: false };
  }
}

