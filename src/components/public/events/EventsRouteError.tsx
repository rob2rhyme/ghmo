"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { Button } from "@/src/components/ui/button";
import { useContactEmail } from "@/src/lib/contactContext";
import { eventsHref } from "./EventCard";
import { COMMUNITY_SLUG } from "@/src/lib/community.constants";

type EventsRouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** "the events" on the list, "this event" on an event page. */
  what: "the events" | "this event";
};

/**
 * The events pages' error.tsx body: the events (or the event) couldn't be read on the first visit, so
 * there is no cached copy to show yet. Same wording as every other "couldn't load" state (C14).
 */
export function EventsRouteError({ error, reset, what }: EventsRouteErrorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const contactEmail = useContactEmail();
  return (
    <div role="alert">
      <MessagePage
        icon={<AlertTriangle />}
        title={`We couldn't load ${what} right now`}
        description={
          contactEmail ? (
            <>
              Try again in a moment. If it keeps happening, email us at{" "}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                {contactEmail}
              </a>
              {error.digest ? " and include the code below" : ""}.
            </>
          ) : (
            "Try again in a moment."
          )
        }
        actions={
          <>
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
            >
              {pending ? "Trying again…" : "Try again"}
            </Button>
            {what === "this event" ? (
              <Button asChild size="lg" variant="outline">
                <Link href={eventsHref(COMMUNITY_SLUG)}>See all events</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline">
                <Link href="/">Go to the home page</Link>
              </Button>
            )}
          </>
        }
      >
        {error.digest && contactEmail ? <code className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">Ref: {error.digest}</code> : null}
      </MessagePage>
    </div>
  );
}
