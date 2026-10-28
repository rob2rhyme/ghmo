import { describe, expect, it } from "vitest";
import { footerFromEnv, unsubscribeApiUrl, unsubscribeHeaders, unsubscribePageUrl, withUnsubscribeFooter } from "@/src/lib/broadcastMail";

const origin = "https://ghmo.example.org";

describe("broadcast mail pieces", () => {
  it("builds the page link and the one-click headers from the same token", () => {
    expect(unsubscribePageUrl(origin, "m1.a+b/c")).toBe(`${origin}/unsubscribe?token=m1.a%2Bb%2Fc`);
    expect(unsubscribeApiUrl(origin, "m1.sig")).toBe(`${origin}/api/unsubscribe?token=m1.sig`);
    expect(unsubscribeHeaders(origin, "m1.sig")).toEqual({
      "List-Unsubscribe": `<${origin}/api/unsubscribe?token=m1.sig>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    });
  });

  it("appends the footer with link, name and postal address", () => {
    const text = withUnsubscribeFooter("Hello all.\n\n", { origin, token: "m1.sig", footer: { orgName: "GHMO", postalAddress: "1 Main St, Town" } });
    expect(text.startsWith("Hello all.\n")).toBe(true);
    expect(text).toContain(`${origin}/unsubscribe?token=m1.sig`);
    expect(text).toContain("GHMO");
    expect(text.trimEnd().endsWith("1 Main St, Town")).toBe(true);
  });

  it("reads the sender identity only when both values are set", () => {
    expect(footerFromEnv({})).toBeNull();
    expect(footerFromEnv({ BROADCAST_ORG_NAME: "GHMO" })).toBeNull();
    expect(footerFromEnv({ BROADCAST_ORG_NAME: " ", BROADCAST_POSTAL_ADDRESS: "x" })).toBeNull();
    expect(footerFromEnv({ BROADCAST_ORG_NAME: " GHMO ", BROADCAST_POSTAL_ADDRESS: " 1 Main St " })).toEqual({ orgName: "GHMO", postalAddress: "1 Main St" });
  });
});
