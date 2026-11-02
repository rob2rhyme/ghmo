"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";

export default function UnsubscribeClient({ token }: { token: string }) {
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
        You&apos;re unsubscribed. You won&apos;t get any more emails from us. If this was a mistake, ask an administrator to add you back.
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground">Press the button to stop receiving email from us. This takes effect right away.</p>
      <Button size="lg" onClick={confirm} loading={state === "busy"} className="self-start">
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
