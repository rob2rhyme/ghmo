import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clearRateLimit } from "@/src/lib/rateLimit";

describe("checkRateLimit", () => {
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then blocks", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 1000).success).toBe(true);
    const blocked = checkRateLimit(key, 3, 1000);
    expect(blocked.success).toBe(false);
    expect(blocked.retryInMs).toBeGreaterThan(0);
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    const key = `t-${Math.random()}`;
    checkRateLimit(key, 1, 1000);
    expect(checkRateLimit(key, 1, 1000).success).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, 1, 1000).success).toBe(true);
  });

  it("can be cleared", () => {
    const key = `t-${Math.random()}`;
    checkRateLimit(key, 1, 1000);
    clearRateLimit(key);
    expect(checkRateLimit(key, 1, 1000).success).toBe(true);
  });
});
