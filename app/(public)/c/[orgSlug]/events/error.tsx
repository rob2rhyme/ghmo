"use client";

import { EventsRouteError } from "@/src/components/public/events/EventsRouteError";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EventsRouteError error={error} reset={reset} what="the events" />;
}
