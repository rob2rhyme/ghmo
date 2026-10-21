import { describe, expect, it } from "vitest";
import { isDevLoginAllowed } from "@/src/lib/security/devLogin";

const TOKEN = "x".repeat(32);

describe("isDevLoginAllowed", () => {
  it("allows local development with the flag and a strong token", () => {
    expect(isDevLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: TOKEN })).toBe(true);
  });

  it("is always off in production, even with the flag and token", () => {
    expect(isDevLoginAllowed({ NODE_ENV: "production", ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: TOKEN })).toBe(false);
    expect(
      isDevLoginAllowed({ NODE_ENV: "development", VERCEL_ENV: "production", ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: TOKEN })
    ).toBe(false);
    expect(
      isDevLoginAllowed({ NODE_ENV: "development", APP_ENV: "production", ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: TOKEN })
    ).toBe(false);
  });

  it("requires a token (no token used to mean anyone could log in)", () => {
    expect(isDevLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_ADMIN_LOGIN: "true" })).toBe(false);
    expect(isDevLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: "short" })).toBe(false);
  });

  it("requires the flag", () => {
    expect(isDevLoginAllowed({ NODE_ENV: "development", DEV_ADMIN_LOGIN_TOKEN: TOKEN })).toBe(false);
  });
});
