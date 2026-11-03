import { describe, expect, it } from "vitest";
import { statusBadge } from "@/src/lib/statusBadges";

describe("statusBadge", () => {
  it("uses one label and colour for the same state everywhere", () => {
    expect(statusBadge("minutes", "submitted")).toEqual({ label: "Waiting for approval", variant: "warning" });
    expect(statusBadge("broadcast", "pending_approval")).toEqual({ label: "Waiting for approval", variant: "warning" });
    expect(statusBadge("actionItem", "done").variant).toBe("success");
    expect(statusBadge("callOutcome", "reached").variant).toBe("success");
    expect(statusBadge("callOutcome", "no_answer").variant).toBe("warning");
  });

  it("has sensible defaults", () => {
    expect(statusBadge("event", undefined)).toEqual({ label: "Draft", variant: "secondary" });
    expect(statusBadge("callOutcome", null)).toEqual({ label: "Not called yet", variant: "secondary" });
    expect(statusBadge("event", "on_hold")).toEqual({ label: "On hold", variant: "outline" });
  });
});
