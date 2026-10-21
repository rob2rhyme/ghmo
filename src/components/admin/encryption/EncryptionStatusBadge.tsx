"use client";

import Link from "next/link";
import { Lock, LockOpen, ShieldOff } from "lucide-react";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { cn } from "@/src/lib/utils";

/** Sidebar indicator of this device's encryption state (plan §5.2). */
export function EncryptionStatusBadge() {
  const { status, lock } = useE2ee();
  if (status === "loading" || status === "error") return null;

  const label =
    status === "unlocked"
      ? "Encryption unlocked"
      : status === "locked"
        ? "Encryption locked"
        : status === "not-setup"
          ? "Encryption not set up"
          : "Set up this device";

  const Icon = status === "unlocked" ? LockOpen : status === "locked" ? Lock : ShieldOff;

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs">
      <Link href="/admin/encryption" className="flex items-center gap-2 font-medium hover:underline">
        <Icon className={cn("size-4", status === "unlocked" ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
        {label}
      </Link>
      {status === "unlocked" ? (
        <button type="button" onClick={lock} className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          Lock
        </button>
      ) : null}
    </div>
  );
}
