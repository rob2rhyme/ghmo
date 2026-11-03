import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { getAdminEnvStatus } from "./env.server";

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
 * Wraps a public read in the shared data cache, keyed by `key` and the call's arguments. A read that throws is
 * not cached. The browser test suites use the same cache as production; they expire it whenever they reset the
 * emulators (app/api/test/expire-public-cache, which exists only in emulator builds).
 */
export function publicCached<A extends unknown[], R>(
  read: (...args: A) => Promise<R>,
  key: string,
  tags: PublicCacheTag[]
): (...args: A) => Promise<R> {
  return unstable_cache(read, [key], { revalidate: PUBLIC_CACHE_SECONDS, tags });
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
 * For pages served from the cache. A failed read throws, so a page is never published with an error message
 * in it: at request time Next keeps serving the last good copy (and retries on the next visit), and a deploy
 * whose build can't read the data fails instead of going live. The one exception is a build with no Firebase
 * settings at all (CI, which never deploys): there the page is built with its "can't be read" state.
 */
export function cachedPageData<T>(value: T | null, what: string): T | null {
  if (value !== null) return value;
  if (isBuildingPages() && !getAdminEnvStatus().ok) return null;
  throw new Error(`${what} could not be read`);
}
