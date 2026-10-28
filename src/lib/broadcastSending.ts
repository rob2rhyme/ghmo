/**
 * Pure helpers for sending broadcasts in chunks (plan §10.3, 8-D). The sender (server) uses them; they
 * are kept free of Firestore so the arithmetic can be unit-tested.
 */
export type SendingConfig = {
  /** Kill switch: nothing is sent unless FEATURE_BROADCASTS=true. */
  enabled: boolean;
  /** Emails per UTC day across all broadcasts (Resend's free tier allows about 100). */
  dailyLimit: number;
  /** Emails per request to the provider (Resend's batch limit is 100). */
  chunkSize: number;
  /** A broadcast with more recipients than this is refused, as a guard against a wrong audience. */
  maxRecipients: number;
};

const intFrom = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

export function sendingConfigFromEnv(env: Record<string, string | undefined> = process.env): SendingConfig {
  return {
    enabled: env.FEATURE_BROADCASTS === "true",
    dailyLimit: intFrom(env.BROADCAST_DAILY_LIMIT, 100, 0, 100_000),
    chunkSize: intFrom(env.BROADCAST_CHUNK_SIZE, 50, 1, 100),
    maxRecipients: intFrom(env.BROADCAST_MAX_RECIPIENTS, 1000, 1, 100_000)
  };
}

/** The quota day, in UTC, as YYYY-MM-DD. */
export function quotaDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** When today's quota resets (next UTC midnight). */
export function nextQuotaReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** How many to claim next: no more than the chunk size, today's remaining quota, or what is left. */
export function nextChunkSize(params: { chunkSize: number; dailyLimit: number; sentToday: number; pending: number }): number {
  const remaining = Math.max(0, params.dailyLimit - params.sentToday);
  return Math.max(0, Math.min(params.chunkSize, remaining, params.pending));
}

/** A claim older than this is treated as abandoned (its server function died) and is retried. */
export const STALE_CLAIM_MS = 3 * 60 * 1000;

export function isStaleClaim(claimedAt: Date | null | undefined, now: Date): boolean {
  return !claimedAt || now.getTime() - claimedAt.getTime() >= STALE_CLAIM_MS;
}

/** After this many failed attempts a delivery is marked failed; an admin can retry failed ones. */
export const MAX_ATTEMPTS = 3;

/** The provider idempotency key for one claim. Reused when an abandoned claim is retried, so nobody gets the email twice. */
export function idempotencyKey(broadcastId: string, claimId: string): string {
  return `ghmo-broadcast-${broadcastId}-${claimId}`;
}
