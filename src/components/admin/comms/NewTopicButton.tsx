"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";

/**
 * The Plans & Issues header button. It links to ?new=1, which opens the form with the title field focused,
 * so it steps aside while that form is already open, and while the board can't be written to (still
 * checking encryption, or this device isn't unlocked yet).
 */
export function NewTopicButton() {
  const { status, enabled } = useE2ee();
  const searchParams = useSearchParams();
  if (searchParams.get("new") === "1") return null;
  if (status === "loading" || status === "error" || (enabled && status !== "unlocked")) return null;
  return (
    <Button asChild>
      <Link href="/admin/comms?new=1" scroll={false}>
        <Plus aria-hidden="true" />
        New topic
      </Link>
    </Button>
  );
}
