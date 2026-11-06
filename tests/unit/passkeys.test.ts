import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// passkeys.ts loads the firebase-admin SDK modules but only reaches Firestore inside its async functions,
// so the pure helpers below run without any Firebase app or credentials.
import { getWebAuthnConfig, isValidCredentialId, passkeyAddressError, RP_NAME } from "@/src/lib/passkeys";

const request = (origin: string, headers: Record<string, string>) =>
  ({ nextUrl: { origin }, headers: new Headers(headers) }) as unknown as NextRequest;

describe("isValidCredentialId", () => {
  it("accepts base64url ids of 16 to 1024 characters", () => {
    expect(isValidCredentialId("a".repeat(16))).toBe(true);
    expect(isValidCredentialId("AbC-_09xyzXYZ-_9")).toBe(true);
    expect(isValidCredentialId("Z".repeat(1024))).toBe(true);
  });

  it("refuses ids that are too short or too long", () => {
    expect(isValidCredentialId("")).toBe(false);
    expect(isValidCredentialId("a".repeat(15))).toBe(false);
    expect(isValidCredentialId("a".repeat(1025))).toBe(false);
  });

  it("refuses characters outside base64url, including path separators", () => {
    for (const id of [
      "abcdefghijklmnop/",
      "abcdefgh/../ijklmnop",
      "abcdefghijklmnop=",
      "abcdefghijklmno+",
      "abcdefgh ijklmnop",
      "abcdefghijklmnop\n",
      "abcdefghijklmnöp"
    ]) {
      expect(isValidCredentialId(id), JSON.stringify(id)).toBe(false);
    }
  });
});

describe("passkeyAddressError", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("APP_PUBLIC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "");
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is null when the visitor is on the configured address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghmo.example.org");
    expect(passkeyAddressError(request("http://internal:3000", { host: "ghmo.example.org" }))).toBeNull();
  });

  it("names both addresses when the visitor is elsewhere", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghmo.example.org");
    const message = passkeyAddressError(request("http://internal:3000", { "x-forwarded-host": "ghmo.other.app" }));
    expect(message).toContain("set up for ghmo.example.org");
    expect(message).toContain("you opened ghmo.other.app");
  });

  it("is null locally with nothing configured, since the request origin is the expected address", () => {
    expect(passkeyAddressError(request("http://localhost:3000", { host: "localhost:3000" }))).toBeNull();
  });

  it("throws in production without a configured address", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => passkeyAddressError(request("http://x", { host: "x" }))).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});

describe("getWebAuthnConfig", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("APP_PUBLIC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "");
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("binds passkeys to the configured hostname", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://ghmo.example.org/admin");
    expect(getWebAuthnConfig(request("http://evil.example", {}))).toEqual({
      rpID: "ghmo.example.org",
      rpName: RP_NAME,
      origin: "https://ghmo.example.org"
    });
  });

  it("throws in production without a configured address unless the emulators are on", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getWebAuthnConfig(request("http://x", {}))).toThrow("NEXT_PUBLIC_APP_URL must be set before passkeys can be used");
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATORS", "true");
    expect(getWebAuthnConfig(request("http://localhost:3100", {}))).toEqual({ rpID: "localhost", rpName: "GHMO Admin", origin: "http://localhost:3100" });
  });
});
