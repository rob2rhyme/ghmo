"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock, ShieldAlert, ShieldOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { PAUSED_BODY, PAUSED_NEXT_STEP, PAUSED_TITLE, PausedDetails } from "./PausedNotice";
import { UnlockCard } from "./UnlockCard";
import { EXPLAIN, WhatIsThis } from "./WhatIsThis";

/**
 * Wraps pages whose data is end-to-end encrypted. Shows the page once this device can
 * read it; otherwise explains what is missing (unlock, set up this device, wait for approval).
 * While encryption is not turned on yet, the page works as before with a one-line reminder.
 *
 * `what` names the page's records in lower case, as they read mid-sentence ("the meeting minutes",
 * "your call list"); `detail` is one optional plain line for the locked card.
 */
export function EncryptionGate({ children, what = "this page", detail }: { children: ReactNode; what?: string; detail?: string }) {
  const { status, enabled, overview, error, refresh, integrity } = useE2ee();

  if (status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Checking encryption…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="Could not check encryption"
        description={error ?? "Try again in a moment."}
        action={<Button onClick={refresh}>Try again</Button>}
      />
    );
  }

  // Before the "encryption is off" branch: a device that pinned the device list and is now told encryption is
  // off (or gets an empty list) reports an integrity failure, and must not render the page under the strip.
  if (status === "integrity-error") {
    return (
      <Alert variant="destructive">
        <ShieldOff />
        <AlertTitle>{PAUSED_TITLE}</AlertTitle>
        <AlertDescription>
          <p>{PAUSED_BODY}</p>
          <p className="mt-2 font-medium text-foreground">
            {PAUSED_NEXT_STEP}{" "}
            <Link href="/admin/encryption" className="font-semibold underline">
              Open Encryption
            </Link>
          </p>
          <PausedDetails reason={integrity.status === "failed" ? integrity.reason : null} />
        </AlertDescription>
      </Alert>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        {/* Phones: the sentence takes the first line and the links drop under it (indented to the text);
            from sm up it is one row. */}
        <div
          role="note"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <span className="flex min-w-0 basis-full items-start gap-2 sm:flex-1 sm:basis-auto sm:items-center">
            <ShieldOff className="mt-0.5 size-4 shrink-0 text-warning sm:mt-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-medium text-foreground">Encryption is off.</span>{" "}
              <span className="text-muted-foreground">Records on this page aren&apos;t extra-locked yet.</span>
            </span>
          </span>
          {overview?.me.superAdmin ? (
            <Link href="/admin/encryption" className="inline-flex min-h-9 items-center font-semibold text-foreground underline underline-offset-2 max-sm:ml-6">
              Turn it on
            </Link>
          ) : (
            <span className="text-muted-foreground max-sm:ml-6">A super admin can turn it on.</span>
          )}
          <WhatIsThis question="What's this?" className="open:basis-full">
            {EXPLAIN.endToEnd}
          </WhatIsThis>
        </div>
        {children}
      </div>
    );
  }

  if (status === "unlocked") return <>{children}</>;

  if (status === "locked") {
    return <UnlockCard what={what} detail={detail} />;
  }

  const message =
    status === "pending"
      ? "This device is waiting for another admin to approve it."
      : status === "revoked"
        ? "This device was removed. Set it up again to continue."
        : "This device has no encryption keys yet.";

  return (
    <EmptyState
      icon={<Lock />}
      title={`Set up this device to see ${what}`}
      description={message}
      action={
        <Button asChild>
          <Link href="/admin/encryption">Open Encryption</Link>
        </Button>
      }
    />
  );
}
