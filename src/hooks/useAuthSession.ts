"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AuthSession = {
  authenticated: boolean;
  isAdmin: boolean;
  role: string | null;
  uid: string | null;
  orgSlug: string | null;
  adminId?: string | null;
  roles?: string[];
  actor?: {
    name?: string;
    roles?: string[];
  };
  error?: string;
  reason?: string;
};

let cachedSession: AuthSession | null | undefined = undefined;
let sessionPromise: Promise<AuthSession | null> | null = null;

async function fetchSession(signal?: AbortSignal): Promise<AuthSession | null> {
  try {
    const res = await fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "include",
      signal
    });
    const data = (await res.json().catch(() => null)) as AuthSession | null;
    cachedSession = data;
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw error;
    }
    cachedSession = null;
    return null;
  }
}

/** Set by the server next to the session cookie (see sessionCookies.ts); readable, holds no secret. */
const SIGNED_IN_HINT = "ghmo_signed_in=1";

/** Visitors have no session: answer without a request to /api/auth/me. */
function hasSignedInHint(): boolean {
  try {
    return document.cookie.split(/;\s*/).includes(SIGNED_IN_HINT);
  } catch {
    return true;
  }
}

const SIGNED_OUT: AuthSession = { authenticated: false, isAdmin: false, role: null, uid: null, orgSlug: null };

async function loadSession(force = false, signal?: AbortSignal): Promise<AuthSession | null> {
  if (!hasSignedInHint()) {
    cachedSession = SIGNED_OUT;
    return SIGNED_OUT;
  }
  if (!force && cachedSession !== undefined) {
    return cachedSession;
  }
  if (!force && sessionPromise) {
    return sessionPromise;
  }
  const promise = fetchSession(signal);
  if (!force) {
    sessionPromise = promise;
  }
  try {
    return await promise;
  } finally {
    if (!force && sessionPromise === promise) {
      sessionPromise = null;
    }
  }
}

function invalidateSessionCache() {
  cachedSession = undefined;
  sessionPromise = null;
}

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(cachedSession ?? null);
  const [loading, setLoading] = useState(cachedSession === undefined);
  const refreshController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setLoading(true);
    invalidateSessionCache();
    try {
      const data = await loadSession(true, controller.signal);
      if (!controller.signal.aborted) {
        setSession(data);
      }
      return data;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        refreshController.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(false, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setSession(data);
        }
      })
      .catch(error => {
        if ((error as any)?.name !== "AbortError") {
          setSession(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      void refresh();
    };
    window.addEventListener("auth:changed", handler);
    return () => {
      window.removeEventListener("auth:changed", handler);
      refreshController.current?.abort();
    };
  }, [refresh]);

  return { session, loading, refresh };
}
