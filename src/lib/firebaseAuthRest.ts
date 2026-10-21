import "server-only";

/**
 * Exchanges a server-minted custom token for a fresh Firebase ID token through the
 * Identity Toolkit REST API (respects FIREBASE_AUTH_EMULATOR_HOST for tests).
 * The ID token is then turned into a session cookie by createSessionResponse().
 */
export async function exchangeCustomTokenForIdToken(customToken: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("NEXT_PUBLIC_FIREBASE_API_KEY is not set; cannot create a session");
    return null;
  }
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const res = await fetch(`${base}/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  if (!res.ok) {
    console.error("Custom token sign-in failed", { status: res.status });
    return null;
  }
  const body = (await res.json().catch(() => ({}))) as { idToken?: string };
  return body.idToken ?? null;
}
