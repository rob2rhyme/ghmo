"use client";

import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Adds a second way out, e.g. "/" on the public site. */
  homeHref?: Route;
  homeLabel?: string;
};

/** Shared body for error.tsx files. Never shows the raw error message to visitors. */
export function RouteError({ error, reset, homeHref, homeLabel = "Go to the home page" }: RouteErrorProps) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden="true" />
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-base text-muted-foreground">
        This page could not be loaded. Try again, and if it keeps happening, share the reference below with an admin.
      </p>
      {error.digest ? <code className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">Ref: {error.digest}</code> : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        {homeHref ? (
          <Button asChild size="lg" variant="outline">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
