"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Shared body for error.tsx files. Never shows the raw error message to visitors. */
export function RouteError({ error, reset }: RouteErrorProps) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This page could not be loaded. Try again, and if it keeps happening, share the reference below with an admin.
      </p>
      {error.digest ? <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">Ref: {error.digest}</code> : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
