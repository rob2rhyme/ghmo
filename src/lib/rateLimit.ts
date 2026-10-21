import "server-only";
import crypto from "node:crypto";

/**
 * Fixed-window rate limiter backed by Firestore, so limits hold across
 * serverless instances (plan S-04). Keys are hashed before storage, so emails
 * and IPs are not stored in plain text.
 *
 * Owner action: add a Firestore TTL policy on the `expiresAt` field of the
 * `rateLimits` collection group so old windows are deleted automatically.
 */

export type RateLimitResult = { success: true } | { success: false; retryInMs: number };

export interface RateLimitStore {
  hit(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
  clear(key: string): Promise<void>;
}

export function hashRateLimitKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, limit, windowMs, now) {
      const id = hashRateLimitKey(key);
      const state = windows.get(id);
      if (!state || state.resetAt <= now) {
        windows.set(id, { count: 1, resetAt: now + windowMs });
        return { success: true };
      }
      if (state.count >= limit) return { success: false, retryInMs: state.resetAt - now };
      state.count += 1;
      return { success: true };
    },
    async clear(key) {
      windows.delete(hashRateLimitKey(key));
    }
  };
}

export function createFirestoreRateLimitStore(): RateLimitStore {
  const collection = async () => {
    const { getAdminDb } = await import("./firebaseAdmin");
    const { COMMUNITY_SLUG } = await import("./community");
    return getAdminDb().collection(`organizations/${COMMUNITY_SLUG}/rateLimits`);
  };
  return {
    async hit(key, limit, windowMs, now) {
      const col = await collection();
      const ref = col.doc(hashRateLimitKey(key));
      return col.firestore.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const data = snap.data() as { count?: number; resetAt?: number } | undefined;
        if (!data || typeof data.resetAt !== "number" || data.resetAt <= now) {
          tx.set(ref, { count: 1, resetAt: now + windowMs, expiresAt: new Date(now + windowMs) });
          return { success: true } as const;
        }
        const count = data.count ?? 0;
        if (count >= limit) return { success: false, retryInMs: data.resetAt - now } as const;
        tx.update(ref, { count: count + 1 });
        return { success: true } as const;
      });
    },
    async clear(key) {
      const col = await collection();
      await col.doc(hashRateLimitKey(key)).delete();
    }
  };
}

let store: RateLimitStore | null = null;

/** Tests swap in a memory store. */
export function setRateLimitStore(next: RateLimitStore | null) {
  store = next;
}

function getStore(): RateLimitStore {
  if (!store) store = createFirestoreRateLimitStore();
  return store;
}

/**
 * Counts one attempt for `key`. Fails closed: if the store errors, the attempt
 * is refused, because these limits protect login and signing endpoints.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    return await getStore().hit(key, limit, windowMs, Date.now());
  } catch (error) {
    console.error("Rate limit store unavailable; refusing request", error instanceof Error ? error.message : error);
    return { success: false, retryInMs: windowMs };
  }
}

export async function clearRateLimit(key: string): Promise<void> {
  await getStore().clear(key);
}
