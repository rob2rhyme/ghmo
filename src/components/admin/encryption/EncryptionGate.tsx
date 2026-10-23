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

/**
 * Wraps pages whose data is end-to-end encrypted. Shows the page once this device can
 * read it; otherwise explains what is missing (unlock, set up this device, wait for approval).
 * While encryption is not turned on yet, the page works as before with a reminder.
 */
export function EncryptionGate({ children, what = "This page" }: { children: ReactNode; what?: string }) {
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
        <Alert variant="warning">
          <ShieldOff />
          <AlertTitle>End-to-end encryption is not on yet</AlertTitle>
          <AlertDescription>
            {what} is stored unencrypted for now.{" "}
            {overview?.me.superAdmin ? (
              <Link href="/admin/encryption" className="font-semibold underline">
                Turn on encryption
              </Link>
            ) : (
              "A super admin can turn it on under Admin → Encryption."
            )}
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  if (status === "integrity-error") {
    return (
      <Alert variant="destructive">
        <ShieldOff />
        <AlertTitle>{what} is paused: the device list failed its check</AlertTitle>
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
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="info">
          <Lock />
          <AlertTitle>{what} is end-to-end encrypted</AlertTitle>
          <AlertDescription>Unlock this device to read and write it.</AlertDescription>
        </Alert>
        <UnlockCard />
      </div>
    );
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
      title={`${what} is end-to-end encrypted`}
      description={message}
      action={
        <Button asChild>
          <Link href="/admin/encryption">Open Encryption</Link>
        </Button>
      }
    />
  );
}
