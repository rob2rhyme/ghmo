"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds so the site can be installed as an app (plan §11).
 * Development skips it so hot reload never fights a cached worker.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installing is optional; the site works the same without it.
    });
  }, []);
  return null;
}
