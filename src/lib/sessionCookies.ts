import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_FALLBACK } from "./auth";

const DEFAULT_MAX_AGE = 60 * 60; // 1 hour

function computeSecureFlag(req?: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const forwardedProto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const requestProto = req?.nextUrl?.protocol?.replace(":", "");
  const isHttps = forwardedProto === "https" || requestProto === "https";
  return isProd && Boolean(isHttps);
}

export function createSessionResponse(
  req: NextRequest | undefined,
  idToken: string,
  payload: Record<string, unknown> = { ok: true }
) {
  const secure = computeSecureFlag(req);
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: DEFAULT_MAX_AGE
  };

  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE_NAME, idToken, cookieOptions);
  response.cookies.set(SESSION_COOKIE_NAME_FALLBACK, idToken, cookieOptions);
  console.debug("Session cookies attached", {
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
    url: req?.url
  });
  return response;
}
