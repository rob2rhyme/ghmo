import { afterEach, describe, expect, it, vi } from "vitest";
// In Node there is no `window`, so importing the module does not initialise Firebase.
import { shouldUseFirebaseEmulators } from "@/src/lib/firebaseClient";

const onHost = (hostname: string) => vi.stubGlobal("window", { location: { hostname } });

describe("shouldUseFirebaseEmulators", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is false on the server", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    expect(typeof window).toBe("undefined");
    expect(shouldUseFirebaseEmulators()).toBe(false);
  });

  it("is true on localhost and 127.0.0.1 with the flag set", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    onHost("localhost");
    expect(shouldUseFirebaseEmulators()).toBe(true);
    onHost("127.0.0.1");
    expect(shouldUseFirebaseEmulators()).toBe(true);
  });

  it("is false on localhost without the flag", () => {
    onHost("localhost");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "");
    expect(shouldUseFirebaseEmulators()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "1");
    expect(shouldUseFirebaseEmulators()).toBe(false);
  });

  it("ignores the flag on any other host", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    for (const host of ["ghmo.example.org", "localhost.evil.com", "127.0.0.2", "0.0.0.0", "[::1]", "::1"]) {
      onHost(host);
      expect(shouldUseFirebaseEmulators(), host).toBe(false);
    }
  });
});
