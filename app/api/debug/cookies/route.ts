import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

function parseCookie(header: string | null) {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = rest.join("=") || "";
    return acc;
  }, {});
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cookieHeader = req.headers.get("cookie");
  const parsed = parseCookie(cookieHeader);

  return NextResponse.json({
    cookieHeader: cookieHeader ?? null,
    parsedCookieNames: Object.keys(parsed),
    hasSessionCookie: Boolean(parsed[SESSION_COOKIE_NAME] || parsed[SESSION_COOKIE_NAME_FALLBACK])
  });
}
