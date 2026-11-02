"use client";

import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { Button } from "@/src/components/ui/button";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Adds a second way out, e.g. "/" on the public site. */
  homeHref?: Route;
  homeLabel?: string;
};

/** Shared body for error.tsx files, in the same message-page look as the 404. Never shows the raw error message. */
export function RouteError({ error, reset, homeHref, homeLabel = "Go to the home page" }: RouteErrorProps) {
  return (
    <div role="alert">
      <MessagePage
        icon={<AlertTriangle />}
        title="Something went wrong"
        description={
          error.digest
            ? "This page could not be loaded. Try again. If it keeps happening, pass on the reference code below."
            : "This page could not be loaded. Please try again."
        }
        actions={
          <>
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            {homeHref ? (
              <Button asChild size="lg" variant="outline">
                <Link href={homeHref}>{homeLabel}</Link>
              </Button>
            ) : null}
          </>
        }
      >
        {error.digest ? <code className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">Ref: {error.digest}</code> : null}
      </MessagePage>
    </div>
  );
}
