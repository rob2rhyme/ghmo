"use client";

import Link from "next/link";
import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { cn } from "@/src/lib/utils";

/** This device's encryption state, as a link to the Encryption page (top bar and phone menu, plan §5.2). */
export function EncryptionStatusBadge({ className }: { className?: string }) {
  const { status, lock } = useE2ee();
  if (status === "loading" || status === "error") return null;

  const label =
    status === "unlocked"
      ? "Encryption unlocked"
      : status === "locked"
        ? "Encryption locked"
        : status === "not-setup"
          ? "Encryption is off"
          : status === "pending"
            ? "Waiting for approval"
            : status === "revoked"
              ? "Device removed"
              : status === "integrity-error"
                ? "Encryption problem"
                : "Set up this device";

  const Icon = status === "unlocked" ? LockOpen : status === "locked" ? Lock : ShieldAlert;
  const needsAction = status !== "unlocked" && status !== "locked";

  return (
    <div
      className={cn(
        "flex min-h-10 items-center justify-between gap-1 rounded-lg border px-1 text-sm",
        needsAction ? "border-warning/40 bg-warning/10" : "border-border bg-card",
        className
      )}
    >
      <Link
        href="/admin/encryption"
        title={needsAction ? "Open the Encryption page to turn it on" : "Open the Encryption page"}
        className="flex min-h-9 items-center gap-2 rounded-md px-2 font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon
          className={cn("size-4 shrink-0", status === "unlocked" ? "text-success" : needsAction ? "text-warning" : "text-muted-foreground")}
          aria-hidden="true"
        />
        {label}
      </Link>
      {status === "unlocked" ? (
        <button
          type="button"
          onClick={lock}
          className="min-h-9 rounded-md px-2.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Lock
        </button>
      ) : null}
    </div>
  );
}
