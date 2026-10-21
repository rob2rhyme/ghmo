import { describe, expect, it } from "vitest";
import { buildPublicCsp, buildSecureCsp, createNonce, isSecurePath } from "@/src/lib/security/csp";

describe("isSecurePath", () => {
  it.each(["/admin", "/admin/login", "/admin/minutes", "/login", "/sign/abc", "/c/ghmo/events", "/docs/onboarding"])(
    "treats %s as secure",
    path => expect(isSecurePath(path)).toBe(true)
  );

  it.each(["/", "/donate", "/multimedia", "/gumba-project", "/administrator", "/signup", "/loginx", "/c"])(
    "treats %s as public",
    path => expect(isSecurePath(path)).toBe(false)
  );
});

describe("createNonce", () => {
  it("is unique and at least 128 bits", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64").length).toBeGreaterThanOrEqual(16);
  });
});

describe("buildSecureCsp", () => {
  const prod = buildSecureCsp({ nonce: "abc", isDev: false, upgradeInsecure: true, firebaseAuthDomain: "x.firebaseapp.com" });

  it("only allows nonce-stamped scripts", () => {
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(prod).not.toContain("unsafe-eval");
  });

  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'none'");
  });

  it("allows the Firebase auth domain in frames", () => {
    expect(prod).toContain("frame-src 'self' blob: https://x.firebaseapp.com");
  });

  it("allows the local Firebase emulators only when asked", () => {
    expect(prod).not.toContain("127.0.0.1");
    const withEmulators = buildSecureCsp({ nonce: "n", isDev: false, upgradeInsecure: false, allowEmulators: true });
    expect(withEmulators).toContain("http://127.0.0.1:8080");
    expect(withEmulators).toContain("http://127.0.0.1:9099");
  });

  it("adds unsafe-eval and dev sockets only in development", () => {
    const dev = buildSecureCsp({ nonce: "n", isDev: true, upgradeInsecure: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("buildPublicCsp", () => {
  it("sets the baseline protections", () => {
    const csp = buildPublicCsp({ upgradeInsecure: true });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
