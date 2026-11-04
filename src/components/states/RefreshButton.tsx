"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";

/** "Try again" for a server-rendered page whose data couldn't be read: renders the page again. */
export function RefreshButton({ children = "Try again" }: { children?: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="lg" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? "Trying again…" : children}
    </Button>
  );
}
