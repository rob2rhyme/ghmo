import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

const STEPS = [
  { title: "Write", detail: "Save a draft and send yourself a test." },
  { title: "Second admin approves", detail: "Another admin reads it and approves exactly that text." },
  { title: "Send", detail: "Email it to members who agreed, then copy it into the group chats." }
] as const;

/**
 * The three steps every broadcast goes through. `current` is the step in progress (0–2), 3 when all are
 * done; leave it out to show the steps without a position (the list page).
 */
export function BroadcastSteps({ current }: { current?: 0 | 1 | 2 | 3 }) {
  return (
    <ol aria-label="How a broadcast goes out" className="grid gap-2 sm:grid-cols-3">
      {STEPS.map((step, index) => {
        const done = current !== undefined && index < current;
        const active = current === index;
        return (
          <li
            key={step.title}
            aria-current={active ? "step" : undefined}
            className={cn("flex min-w-0 items-start gap-3 rounded-xl border p-3", active ? "border-primary/40 bg-primary/5" : "border-border bg-card")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                done ? "bg-success/10 text-success" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
              <span className="block text-sm text-muted-foreground">{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
