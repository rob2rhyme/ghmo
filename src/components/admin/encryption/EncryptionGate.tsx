"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock, ShieldAlert, ShieldOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
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

  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="note"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <ShieldOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">Encryption is off.</span>{" "}
            <span className="text-muted-foreground">Records on this page aren&apos;t extra-locked yet.</span>
          </span>
          {overview?.me.superAdmin ? (
            <Link href="/admin/encryption" className="inline-flex min-h-9 items-center font-semibold text-foreground underline underline-offset-2">
              Turn it on
            </Link>
          ) : (
            <span className="text-muted-foreground">A super admin can turn it on.</span>
          )}
          <WhatIsThis question="What's this?" className="w-full">
            {EXPLAIN.endToEnd}
          </WhatIsThis>
        </div>
        {children}
      </div>
    );
  }

  if (status === "integrity-error") {
    return (
      <Alert variant="destructive">
        <ShieldOff />
        <AlertTitle>Paused: the device list failed its check</AlertTitle>
        <AlertDescription>
          {integrity.status === "failed" ? integrity.reason : "The device list could not be verified."} Don&apos;t approve devices or share anything until an
          admin you trust confirms what changed.{" "}
          <Link href="/admin/encryption" className="font-semibold underline">
            Open Encryption
          </Link>
        </AlertDescription>
      </Alert>
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
        ? "This device was revoked. Set it up again to continue."
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
