import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type Step = { title: React.ReactNode; description?: React.ReactNode; state: "done" | "current" | "todo"; action?: React.ReactNode };

/**
 * Numbered steps for a process (write → approve → send; set up → recovery key → paper copies).
 * Done steps show a check, the current step is ringed in the accent, and the state is also in text for
 * screen readers. `layout="row"` lays short steps side by side from sm; "list" stacks them with room for actions.
 */
function Steps({ steps, label, layout = "row", className }: { steps: Step[]; label: string; layout?: "row" | "list"; className?: string }) {
  return (
    <ol aria-label={label} className={cn(layout === "row" ? "grid gap-2 sm:auto-cols-fr sm:grid-flow-col" : "flex flex-col gap-2", className)}>
      {steps.map((step, i) => (
        <li
          key={i}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn(
            "flex min-w-0 items-start gap-3 rounded-xl border p-3",
            step.state === "current" ? "border-primary/50 bg-primary/5" : "border-border bg-card"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              step.state === "done" && "bg-success/15 text-success",
              step.state === "current" && "bg-primary text-primary-foreground",
              step.state === "todo" && "bg-muted text-muted-foreground"
            )}
          >
            {step.state === "done" ? <Check className="size-4" /> : i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {step.title}
              <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (current step)" : " (to do)"}</span>
            </span>
            {step.description ? <span className="mt-0.5 block text-sm text-muted-foreground">{step.description}</span> : null}
          </span>
          {step.action ? <span className="shrink-0 self-center">{step.action}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export { Steps };
