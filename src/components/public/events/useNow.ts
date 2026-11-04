"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, MINUTE);
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** The current time, to the minute, so the value stays the same between renders within a minute. */
function currentMinute() {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

/**
 * "Now" for deciding whether an event is upcoming or over on a cached page. The server render (and the
 * browser's first render, so hydration matches) uses `renderedAt`, the time the cached copy was built;
 * right after that the browser switches to its own clock and keeps it current while the page is open.
 * A cached copy can be hours old, so the server's time alone is never trusted after the first paint.
 */
export function useNow(renderedAt: number): number {
  return useSyncExternalStore(subscribe, currentMinute, () => renderedAt);
}
