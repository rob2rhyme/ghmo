import { describe, expect, it } from "vitest";
import { getClientIp } from "@/src/lib/security/clientIp";

const h = (init: Record<string, string>) => new Headers(init);

describe("getClientIp", () => {
  it("uses the right-most X-Forwarded-For entry by default (spoof-resistant)", () => {
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), {})).toBe("203.0.113.9");
  });

  it("honours TRUSTED_PROXY_HOPS", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" });
    expect(getClientIp(headers, { TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.9");
  });

  it("uses x-real-ip on Vercel", () => {
    const headers = h({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6" });
    expect(getClientIp(headers, { VERCEL: "1" })).toBe("198.51.100.7");
  });

  it("ignores x-real-ip off Vercel (it can be spoofed)", () => {
    expect(getClientIp(h({ "x-real-ip": "6.6.6.6" }), {})).toBe("unknown");
  });

  it("returns unknown without headers", () => {
    expect(getClientIp(h({}), {})).toBe("unknown");
  });
});
