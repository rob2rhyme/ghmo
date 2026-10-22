"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_PREFIX } from "@/src/lib/localDrafts";
import { useE2ee } from "./E2eeProvider";

/**
 * Keeps an unsent form safe across reloads and crashes without ever writing readable text to the
 * browser's storage: the draft is encrypted with the workspace key (so it needs an unlocked device)
 * and stored locally; it never goes to the server. Nothing is saved while encryption is off or the
 * device is locked.
 */
export const draftStorageKey = (uid: string, name: string) => `${DRAFT_PREFIX}${uid}:${name}`;
const draftLocation = (uid: string, name: string) => ({ path: `local-drafts/${uid}`, docId: name });
const SAVE_DELAY_MS = 1000;

type Stored = { savedAt: number; enc: unknown };

export function useEncryptedDraft<T>(params: { uid: string; name: string; value: T; hasContent: boolean }) {
  const { uid, name, value, hasContent } = params;
  const { enabled, keysOpen, encrypt, decrypt } = useE2ee();
  const active = enabled && keysOpen && Boolean(uid);
  const [pending, setPending] = useState<{ savedAt: number; value: T } | null>(null);
  // Saving waits until a found draft has been restored or discarded, so it isn't overwritten by accident.
  const loadedFor = useRef<string | null>(null);

  const storageKey = draftStorageKey(uid, name);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      let found: { savedAt: number; value: T } | null = null;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const stored = JSON.parse(raw) as Stored;
          found = { savedAt: stored.savedAt, value: await decrypt<T>(stored.enc, draftLocation(uid, name)) };
        }
      } catch {
        // Unreadable (keys rotated, storage blocked, tampered): treat as no draft.
        try {
          window.localStorage.removeItem(storageKey);
        } catch {}
      }
      if (cancelled) return;
      loadedFor.current = storageKey;
      setPending(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, storageKey, uid, name, decrypt]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!active || !hasContent || pending || loadedFor.current !== storageKey) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const enc = await encrypt(draftLocation(uid, name), JSON.parse(serialized));
          window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), enc } satisfies Stored));
        } catch {
          // Storage full or blocked: autosave is a convenience, never an error.
        }
      })();
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, hasContent, pending, serialized, storageKey, uid, name, encrypt]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
    setPending(null);
  }, [storageKey]);

  const restore = useCallback((): T | null => {
    const restored = pending?.value ?? null;
    setPending(null);
    return restored;
  }, [pending]);

  return { pending: pending ? { savedAt: pending.savedAt } : null, restore, discard: clear, clear };
}
