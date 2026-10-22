import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { CLIENT_NOTIFICATION_KINDS } from "@/src/lib/notifications";
import { notifyAdmins } from "@/src/lib/notify.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ kind: z.enum(CLIENT_NOTIFICATION_KINDS) });

/**
 * Admin browsers call this after they add chat or Plans & Issues activity, because those records are
 * written directly to Firestore. The email carries no content, so nothing is taken from the request
 * except which kind of activity it was.
 */
export async function POST(req: NextRequest) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const parsed = await parseJsonBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  if (!(await checkRateLimit(`notify-call:${guard.actor.uid}`, 60, 60 * 60 * 1000)).success) {
    return NextResponse.json({ ok: true, sent: 0 });
  }
  const sent = await notifyAdmins(parsed.data.kind, guard.actor.uid, req.nextUrl.origin);
  return NextResponse.json({ ok: true, sent });
}
