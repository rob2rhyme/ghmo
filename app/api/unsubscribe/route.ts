import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/src/lib/security/clientIp";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { memberIdFromToken, optOutMember } from "@/src/lib/memberSuppression.server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/unsubscribe";
const LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Public, no login: the signed token in the link is the credential. Mail apps call this with POST for
 * one-click unsubscribe (RFC 8058, token in the query string); the unsubscribe page calls it too.
 * It is POST-only on purpose: link scanners and prefetchers open links with GET and must not unsubscribe
 * anyone. Every valid token gets the same answer whether or not the member still exists.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const limited = await checkRateLimit(`unsubscribe:${ip}`, LIMIT, WINDOW_MS);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryInMs / 1000)) } });
  }

  let token = req.nextUrl.searchParams.get("token");
  if (!token) {
    // The unsubscribe page sends the token in a small JSON body instead.
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : null;
  }

  const memberId = memberIdFromToken(token);
  if (!memberId) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });

  await optOutMember(memberId, "unsubscribe_link", { ip, userAgent: req.headers.get("user-agent"), route: ROUTE });
  return NextResponse.json({ ok: true });
}
