import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { AdminAccessError, type AdminActor, type AdminProfile } from "./admin";
import { AdminEnvError, getAdminEnvStatus } from "./env.server";
import { getClientIp } from "./security/clientIp";

/** Small helpers shared by the Phase 11 admin routes, so each route is only its own rules. */

export const UNAVAILABLE_MESSAGE = "This can't be loaded right now. Try again in a moment; if it keeps happening, tell whoever manages the website.";

/** A 503 answer while the server's admin settings are missing, or null when everything is set. */
export function envUnavailable(): NextResponse | null {
  return getAdminEnvStatus().ok ? null : NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
}

/** Turns the errors every admin route can throw into answers; anything else is a real bug and is rethrown. */
export function routeError(error: unknown): NextResponse {
  if (error instanceof AdminAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AdminEnvError) return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
  throw error;
}

export function auditActor(actor: AdminActor, admin: AdminProfile) {
  return { uid: actor.uid, adminId: admin.id, name: actor.name, email: actor.email, role: actor.roles[0] ?? "admin" };
}

export function auditMeta(req: NextRequest, route: string) {
  return { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route };
}

/** Domain failures the storage libs return instead of throwing, so a route can answer them in one line. */
export type Failure = { ok: false; status: number; error: string };
export const fail = (status: number, error: string): Failure => ({ ok: false, status, error });
export function failureResponse(failure: Failure): NextResponse {
  return NextResponse.json({ error: failure.error }, { status: failure.status });
}
