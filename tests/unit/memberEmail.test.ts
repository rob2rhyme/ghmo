import { describe, expect, it } from "vitest";
import { hasTrustedMemberEmail } from "@/src/lib/auth";

describe("hasTrustedMemberEmail", () => {
  const token = (over: Partial<{ email_verified: boolean; provider: string }>) =>
    ({ email_verified: over.email_verified ?? true, firebase: { sign_in_provider: over.provider ?? "emailLink" } }) as never;

  it("accepts a verified email from the email link or a token this server minted", () => {
    expect(hasTrustedMemberEmail(token({ provider: "emailLink" }))).toBe(true);
    expect(hasTrustedMemberEmail(token({ provider: "custom" }))).toBe(true);
  });

  it("refuses unverified emails and password accounts (someone could create one with a member's address)", () => {
    expect(hasTrustedMemberEmail(token({ email_verified: false }))).toBe(false);
    expect(hasTrustedMemberEmail(token({ provider: "password" }))).toBe(false);
    expect(hasTrustedMemberEmail(token({ provider: "google.com" }))).toBe(false);
    expect(hasTrustedMemberEmail({ email_verified: true, firebase: undefined } as never)).toBe(false);
  });
});
