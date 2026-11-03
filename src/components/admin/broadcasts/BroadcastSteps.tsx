import { Steps, type Step } from "@/src/components/ui/steps";

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
  const steps: Step[] = STEPS.map((step, index) => ({
    title: step.title,
    description: step.detail,
    state: current === undefined ? "todo" : index < current ? "done" : index === current ? "current" : "todo"
  }));
  return <Steps label="How a broadcast goes out" steps={steps} />;
}
