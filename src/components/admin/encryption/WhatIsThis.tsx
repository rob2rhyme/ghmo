import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** A small "What is …?" disclosure that explains one technical word in a plain line. */
export function WhatIsThis({ question, children, className }: { question: string; children: ReactNode; className?: string }) {
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        {question}
      </summary>
      <p className="mt-1 max-w-prose text-muted-foreground">{children}</p>
    </details>
  );
}

/** One-line explanations of the encryption words, kept together so they read the same everywhere. */
export const EXPLAIN = {
  endToEnd:
    "End-to-end encryption locks private records (chat, minutes, phone numbers) with keys that only approved admin devices hold. Even the website's own server, and anyone who breaks into it, sees only scrambled text.",
  passkey:
    "A passkey is the fingerprint, face or screen-lock sign-in saved on this device. It can also lock this device's encryption keys, so there is nothing extra to remember.",
  passphrase:
    "A passphrase is a long password used only for encryption. You type it each time you open the keys on this device. Use it if you sign in with an authenticator app, or your passkey can't do this.",
  recoveryKey:
    "The recovery key is a long code kept on paper. It is the backup way in if every admin loses their devices at once.",
  trustees:
    "Trustees are two people you trust, for example two board members. Each keeps one paper copy of the recovery key somewhere safe and separate.",
  safetyCode:
    "A safety code is a short code made from a device's keys. When it is the same on both screens, you know nobody swapped the device on the way.",
  fingerprint:
    "The workspace fingerprint identifies GHMO's encryption setup and never changes. A new admin who sees the same fingerprint knows they are joining the real one.",
  rotation:
    "Making new keys replaces the encryption keys with a fresh set. Removed devices don't get the new keys, so they can't read anything written after that.",
  deviceList:
    "This is every computer and phone that holds encryption keys. Your browser checks it against a signed history each time, so a device added behind your back gets noticed."
} as const;
