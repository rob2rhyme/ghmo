import { describe, expect, it } from "vitest";
import { requestHostname, wrongAddressMessage } from "@/src/lib/security/appHost";

const headers = (init: Record<string, string>) => new Headers(init);

describe("requestHostname", () => {
  it("prefers the forwarded host and drops the port", () => {
    expect(requestHostname(headers({ "x-forwarded-host": "Ghmo.Example.org:443", host: "internal:3000" }))).toBe("ghmo.example.org");
  });

  it("uses the first of several forwarded hosts", () => {
    expect(requestHostname(headers({ "x-forwarded-host": "a.example.org, b.example.org" }))).toBe("a.example.org");
  });

  it("falls back to the Host header, and is null with neither", () => {
    expect(requestHostname(headers({ host: "localhost:3100" }))).toBe("localhost");
    expect(requestHostname(headers({}))).toBeNull();
  });
});

describe("wrongAddressMessage", () => {
  const configured = "https://ghmo.vercel.app";

  it("is null when the visitor is on the configured address", () => {
    expect(wrongAddressMessage(configured, headers({ host: "ghmo.vercel.app" }))).toBeNull();
    expect(wrongAddressMessage(configured, headers({ "x-forwarded-host": "GHMO.vercel.app" }))).toBeNull();
  });

  it("names both addresses and the fix when they differ", () => {
    const message = wrongAddressMessage(configured, headers({ host: "ghmo.rob2rhyme.app" }));
    expect(message).toContain("ghmo.vercel.app");
    expect(message).toContain("ghmo.rob2rhyme.app");
    expect(message).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("does not guess when nothing is configured, the setting is not a URL, or the host is unknown", () => {
    expect(wrongAddressMessage(undefined, headers({ host: "anything.example" }))).toBeNull();
    expect(wrongAddressMessage("not a url", headers({ host: "anything.example" }))).toBeNull();
    expect(wrongAddressMessage(configured, headers({}))).toBeNull();
  });
});
