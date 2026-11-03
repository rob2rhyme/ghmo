import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { connection } from "next/server";

/**
 * How long public pages and their data may be served from the cache before they are rebuilt in the
 * background. Admin writes expire the matching tag at once (see expirePublicCache), so this only bounds
 * how long a change made outside the app (for example in the Firebase console) takes to show.
 */
export const PUBLIC_CACHE_SECONDS = 300;

/** Cache tags for the public data, one per kind of record. */
export const PUBLIC_CACHE_TAGS = {
  events: "public-events",
  minutes: "public-minutes",
  donations: "donation-stats"
} as const;

export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[keyof typeof PUBLIC_CACHE_TAGS];

/**
 * Against the Firebase emulators (the browser test suites) nothing is cached: tests write to Firestore
 * directly between steps, and a cached page would show the previous test's data.
 */
function publicCachingOff(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}

/**
 * Wraps a public read in the shared data cache, keyed by `key` and the call's arguments. A read that
 * throws is not cached. With caching off it runs on every request, and `connection()` keeps the page
 * that called it from being built once and frozen.
 */
export function publicCached<A extends unknown[], R>(
  read: (...args: A) => Promise<R>,
  key: string,
  tags: PublicCacheTag[]
): (...args: A) => Promise<R> {
  const cached = unstable_cache(read, [key], { revalidate: PUBLIC_CACHE_SECONDS, tags });
  return async (...args: A) => {
    if (publicCachingOff()) {
      await connection();
      return read(...args);
    }
    return cached(...args);
  };
}

/** Expires cached public data at once, after an admin change to it. Safe to call when nothing is cached. */
export function expirePublicCache(...tags: PublicCacheTag[]): void {
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (error) {
      // Outside a request (scripts, unit tests) there is no cache to expire.
      console.warn("Could not expire the public cache", tag, error instanceof Error ? error.message : error);
    }
  }
}

/** True while `next build` prerenders pages: no request, and in CI no Firebase settings either. */
export function isBuildingPages(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * For pages served from the cache. At request time a failed read throws, so Next keeps serving the last
 * good copy of the page (and retries on the next visit) instead of caching an error message for minutes.
 * While the build prerenders, it returns null so the build still finishes; the page then shows its
 * "can't be read" state until its first refresh.
 */
export function cachedPageData<T>(value: T | null, what: string): T | null {
  if (value !== null || isBuildingPages()) return value;
  throw new Error(`${what} could not be read`);
}
