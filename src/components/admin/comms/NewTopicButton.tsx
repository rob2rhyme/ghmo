"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";

type CommsFormVisibility = { formShown: boolean; setFormShown: (shown: boolean) => void };

const CommsFormContext = createContext<CommsFormVisibility | null>(null);

/**
 * Lets the board tell the header button whether its own "Start a new topic" form is on screen, so the page
 * never shows two primary actions. Until the board has reported, the button stays hidden (the first-run board
 * opens the form by itself, and the button would otherwise flash in and out).
 */
export function CommsFormProvider({ children }: { children: ReactNode }) {
  const [formShown, setFormShown] = useState(true);
  const value = useMemo(() => ({ formShown, setFormShown }), [formShown]);
  return <CommsFormContext.Provider value={value}>{children}</CommsFormContext.Provider>;
}

/** Called by the board with "the form is showing (or the list is still loading)". */
export function useReportCommsForm(shown: boolean) {
  const setFormShown = useContext(CommsFormContext)?.setFormShown;
  useEffect(() => {
    setFormShown?.(shown);
  }, [setFormShown, shown]);
}

/**
 * The Plans & Issues header button. It links to ?new=1, which opens the form with the title field focused,
 * so it steps aside while that form is already open (asked for, first run with no topics, or a draft waiting),
 * and while the board can't be written to (still checking encryption, a failed device-list check, or this
 * device isn't unlocked yet).
 */
export function NewTopicButton() {
  const { status, enabled } = useE2ee();
  const searchParams = useSearchParams();
  const formShown = useContext(CommsFormContext)?.formShown ?? false;
  if (formShown || searchParams.get("new") === "1") return null;
  if (status === "loading" || status === "error" || status === "integrity-error" || (enabled && status !== "unlocked")) return null;
  return (
    <Button asChild>
      <Link href="/admin/comms?new=1" scroll={false}>
        <Plus aria-hidden="true" />
        New topic
      </Link>
    </Button>
  );
}
