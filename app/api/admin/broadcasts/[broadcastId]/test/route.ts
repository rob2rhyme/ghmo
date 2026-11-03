import { NextRequest, NextResponse } from "next/server";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { getAppOrigin } from "@/src/lib/appUrl";
import { normalizeBroadcastContent } from "@/src/lib/broadcast";
import { footerFromEnv, withUnsubscribeFooter } from "@/src/lib/broadcastMail";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgBroadcastsCollectionPath } from "@/src/lib/firestorePaths";
import { isMailConfigured, sendMail } from "@/src/lib/mailer.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Sends the broadcast to the signed-in admin only, so they can see how it will look in a real inbox.
 * The subject says TEST and the unsubscribe link is a dead preview link. Works on any non-cancelled
 * broadcast and never touches members.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ broadcastId: string }> }) {
  const guard = await enforceActiveAdmin(req, COMMUNITY_SLUG);
  if ("response" in guard) return guard.response;
  const { actor, admin } = guard;
  const { broadcastId } = await context.params;
  if (!ID_PATTERN.test(broadcastId)) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

  const snap = await getAdminDb().doc(`${orgBroadcastsCollectionPath(COMMUNITY_SLUG)}/${broadcastId}`).get();
  if (!snap.exists) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  const content = normalizeBroadcastContent(snap.data() ?? {});
  if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 });
  if (snap.get("status") === "cancelled") return NextResponse.json({ error: "This broadcast was canceled." }, { status: 409 });

  const to = admin.email ?? actor.email;
  if (!to) return NextResponse.json({ error: "Your admin profile has no email address to send to." }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Email sending isn't set up on this site yet." }, { status: 409 });
  const footer = footerFromEnv();
  if (!footer) {
    return NextResponse.json({ error: "Every broadcast needs the organization's name and postal address in its footer. Ask whoever manages the website to add them." }, { status: 409 });
  }

  const limited = await checkRateLimit(`broadcast-test:${actor.uid}`, 5, 60 * 60 * 1000);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many test emails. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryInMs / 1000)) } });
  }

  const origin = getAppOrigin(req);
  const text =
    "THIS IS A TEST. Only you received it; the unsubscribe link below is a preview and does nothing.\n\n" +
    withUnsubscribeFooter(content.content.body, { origin, token: "preview", footer });
  const sent = await sendMail({ to, subject: `[TEST] ${content.content.subject}`, text });
  if (!sent) return NextResponse.json({ error: "The email could not be sent. Try again in a moment." }, { status: 502 });

  await logAuditEvent({
    orgSlug: COMMUNITY_SLUG,
    action: "broadcast_test_sent",
    actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
    resource: { type: "broadcast", id: broadcastId },
    meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: "/api/admin/broadcasts/[broadcastId]/test" }
  });
  return NextResponse.json({ ok: true, sentTo: to });
}
