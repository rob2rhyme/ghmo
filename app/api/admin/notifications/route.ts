import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminDocPath } from "@/src/lib/firestorePaths";
import { isMailConfigured } from "@/src/lib/mailer.server";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

/** Your own email-notification preference (off unless you turn it on). */
export async function GET(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const doc = await getAdminDb().doc(orgAdminDocPath(COMMUNITY_SLUG, guard.actor.uid)).get();
  return NextResponse.json({ email: doc.data()?.notifyEmail === true, configured: isMailConfigured(), address: guard.actor.email ?? null });
}

export async function PATCH(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const parsed = await parseJsonBody(req, z.object({ email: z.boolean() }));
  if (!parsed.ok) return parsed.response;
  if (parsed.data.email && !guard.actor.email) {
    return NextResponse.json({ error: "Your admin profile has no email address to send to." }, { status: 400 });
  }
  await getAdminDb().doc(orgAdminDocPath(COMMUNITY_SLUG, guard.actor.uid)).update({ notifyEmail: parsed.data.email });
  return NextResponse.json({ ok: true, email: parsed.data.email });
}
