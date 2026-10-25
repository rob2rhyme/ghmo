import "server-only";
import { NextResponse } from "next/server";
import { AdminAccessError } from "./admin";
import { issueCustomToken } from "./auth";
import { AdminEnvError } from "./env.server";
import { exchangeCustomTokenForIdToken } from "./firebaseAuthRest";
import { createSessionResponse } from "./sessionCookies";
import { TotpError } from "./totpStore";

/** Turns the errors the authenticator routes can raise into responses; unknown errors still throw. */
export function totpErrorResponse(error: unknown): NextResponse {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof TotpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  if (error instanceof Error && /DOCGEN_SIGNATURE_ENC_KEY_BASE64/.test(error.message)) {
    console.error("Authenticator sign-in needs DOCGEN_SIGNATURE_ENC_KEY_BASE64 to be set", error.message);
    return NextResponse.json({ error: "Authenticator sign-in is not configured on this site" }, { status: 503 });
  }
  throw error;
}

/** A strong (authenticator-app) session for this admin, as a response that sets the session cookie. */
export async function startTotpSession(uid: string, payload: Record<string, unknown> = { ok: true }) {
  const customToken = await issueCustomToken(uid, "admin", "totp");
  const idToken = await exchangeCustomTokenForIdToken(customToken);
  if (!idToken) return NextResponse.json({ error: "Unable to create session" }, { status: 500 });
  return createSessionResponse(idToken, payload);
}
