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

export async function sendMail(message: { to: string; subject: string; text: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!isMailConfigured()) return false;
  try {
    const res = await fetchImpl(process.env.MAIL_API_URL || DEFAULT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM_EMAIL, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch (error) {
    // Never log the address or message.
    console.error("Notification email failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
