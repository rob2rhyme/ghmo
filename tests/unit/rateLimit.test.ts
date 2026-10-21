import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  createMemoryRateLimitStore,
  hashRateLimitKey,
  setRateLimitStore,
  type RateLimitStore
} from "@/src/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => setRateLimitStore(createMemoryRateLimitStore()));
  afterEach(() => {
    setRateLimitStore(null);
    vi.useRealTimers();
  });

  it("allows up to the limit, then blocks", async () => {
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("k1", 3, 1000)).success).toBe(true);
    const blocked = await checkRateLimit("k1", 3, 1000);
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.retryInMs).toBeGreaterThan(0);
  });

  it("resets after the window", async () => {
    vi.useFakeTimers();
    await checkRateLimit("k2", 1, 1000);
    expect((await checkRateLimit("k2", 1, 1000)).success).toBe(false);
    vi.advanceTimersByTime(1001);
    expect((await checkRateLimit("k2", 1, 1000)).success).toBe(true);
  });

  it("keeps keys independent", async () => {
    await checkRateLimit("a", 1, 1000);
    expect((await checkRateLimit("b", 1, 1000)).success).toBe(true);
  });

  it("can be cleared", async () => {
    await checkRateLimit("k3", 1, 1000);
    await clearRateLimit("k3");
    expect((await checkRateLimit("k3", 1, 1000)).success).toBe(true);
  });

  it("fails closed when the store errors", async () => {
    const broken: RateLimitStore = {
      hit: async () => {
        throw new Error("firestore down");
      },
      clear: async () => {}
    };
    setRateLimitStore(broken);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await checkRateLimit("k4", 10, 1000)).success).toBe(false);
  });
});

describe("hashRateLimitKey", () => {
  it("does not store keys in plain text", () => {
    const hashed = hashRateLimitKey("email:admin@example.org");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain("admin");
  });
});
