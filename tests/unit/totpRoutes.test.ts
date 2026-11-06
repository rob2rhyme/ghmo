import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAccessError } from "@/src/lib/admin";
import { AdminEnvError } from "@/src/lib/env.server";
import { totpErrorResponse } from "@/src/lib/totpRoutes";
import { TotpError } from "@/src/lib/totpStore";

describe("totpErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes an admin access error's status and message through", async () => {
    const res = totpErrorResponse(new AdminAccessError(403, "Passkey sign-in required", "weak_session"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Passkey sign-in required" });
  });

  it("passes an authenticator error's status and message through", async () => {
    const res = totpErrorResponse(new TotpError(409, "Start the authenticator setup first"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Start the authenticator setup first" });
    expect(totpErrorResponse(new TotpError(429, "Too many tries")).status).toBe(429);
  });

  it("hides the details of missing admin configuration behind a 503", async () => {
    const res = totpErrorResponse(new AdminEnvError(["FIREBASE_ADMIN_PRIVATE_KEY"]));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "This can't be loaded right now. Try again in a few minutes." });
    expect(JSON.stringify(body)).not.toContain("FIREBASE_ADMIN");
  });

  it("explains a missing encryption key with a 503 and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = totpErrorResponse(new Error("DOCGEN_SIGNATURE_ENC_KEY_BASE64 is not set"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Authenticator sign-in isn't set up on this site yet. Sign in with your passkey." });
    expect(log).toHaveBeenCalledOnce();
  });

  it("rethrows anything else", () => {
    const unknown = new Error("boom");
    expect(() => totpErrorResponse(unknown)).toThrow(unknown);
    expect(() => totpErrorResponse("a string")).toThrow();
    expect(() => totpErrorResponse({ message: "DOCGEN_SIGNATURE_ENC_KEY_BASE64" })).toThrow();
  });
});
