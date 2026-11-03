"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";

/** `contactEmail` comes from getContactEmail() on the server; without it, no contact line is shown. */
export default function UnsubscribeClient({ token, contactEmail = null }: { token: string; contactEmail?: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const confirm = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p role="status" className="text-foreground">
        You&apos;re unsubscribed. You won&apos;t get any more emails from us.
        {contactEmail ? (
          <>
            {" "}
            If this was a mistake, email us at{" "}
            <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
              {contactEmail}
            </a>{" "}
            to be added back.
          </>
        ) : (
          " If this was a mistake, reply to one of our emails and ask to be added back."
        )}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">Press the button to stop receiving email from us. This takes effect right away.</p>
      <Button size="lg" onClick={confirm} loading={state === "busy"} className="w-full sm:w-auto sm:self-start">
        Unsubscribe me
      </Button>
      {state === "error" ? (
        <p role="alert" className="text-destructive">
          Something went wrong. Please try again in a moment.
        </p>
      ) : null}
    </>
  );
}
