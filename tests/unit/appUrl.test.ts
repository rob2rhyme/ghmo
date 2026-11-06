import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppOrigin } from "@/src/lib/appUrl";

const request = (origin: string) => ({ nextUrl: { origin } }) as unknown as NextRequest;
const REQ = request("http://forged-host.example:3000");

describe("getAppOrigin", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("APP_PUBLIC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "");
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured address, reduced to its origin, over the request", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghmo.example.org/some/path?x=1");
    expect(getAppOrigin(REQ)).toBe("https://ghmo.example.org");
  });

  it("falls back to APP_PUBLIC_URL, with NEXT_PUBLIC_APP_URL winning when both are set", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://public.example.org");
    expect(getAppOrigin(REQ)).toBe("https://public.example.org");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://next.example.org");
    expect(getAppOrigin(REQ)).toBe("https://next.example.org");
  });

  it("uses the configured address in production too", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghmo.example.org");
    expect(getAppOrigin(REQ)).toBe("https://ghmo.example.org");
  });

  it("uses the request origin outside production when nothing is configured", () => {
    expect(getAppOrigin(REQ)).toBe("http://forged-host.example:3000");
  });

  it("ignores an invalid configured address and falls through to the request outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");
    expect(getAppOrigin(REQ)).toBe("http://forged-host.example:3000");
  });

  it("throws in production without a configured address", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAppOrigin(REQ)).toThrow("NEXT_PUBLIC_APP_URL must be set before links can be sent");
  });

  it("throws in production when the configured address is invalid", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "ghmo.example.org");
    expect(() => getAppOrigin(REQ)).toThrow(/NEXT_PUBLIC_APP_URL must be set/);
  });

  it("uses the request origin in a production build against the emulators", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    expect(getAppOrigin(REQ)).toBe("http://forged-host.example:3000");
  });

  it("only accepts the exact string \"true\" for the emulator flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "1");
    expect(() => getAppOrigin(REQ)).toThrow();
  });
});
