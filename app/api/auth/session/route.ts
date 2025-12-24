import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/src/lib/auth";

export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const decoded = await verifyIdToken(idToken);
  const response = NextResponse.json({ ok: true, claims: decoded });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: 60 * 60
  };
  response.cookies.set("sessionToken", idToken, cookieOptions);
  // __session is the default cookie name honored by Firebase Hosting/Edge-safe checks.
  response.cookies.set("__session", idToken, cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("sessionToken", "", { httpOnly: true, maxAge: 0, path: "/" });
  response.cookies.set("__session", "", { httpOnly: true, maxAge: 0, path: "/" });
  return response;
}
