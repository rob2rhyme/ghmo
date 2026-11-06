import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAdmin } from "@/src/lib/admin";
import { auditActor, auditMeta, envUnavailable, routeError } from "@/src/lib/adminRoute.server";
import { logAuditEvent } from "@/src/lib/audit";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/member-export";
const bodySchema = z
  .object({
    count: z.number().int().min(0).max(100_000),
    scope: z.enum(["all", "shown"]),
    includesPhones: z.boolean()
  })
  .strict();

/**
 * Records that an admin is downloading the member list (plan §19). The file is built in the browser, from the list the admin
 * can already see and, only when they ask and their device is unlocked, the phone numbers it can already decrypt, so the
 * server never holds the file or any number. The page calls this first and downloads only if it answers ok, so no export
 * goes unrecorded. The entry holds counts and choices, never a name, email or number.
 */
export async function POST(req: NextRequest) {
  const unavailable = envUnavailable();
  if (unavailable) return unavailable;
  try {
    const { actor, admin } = await requireActiveAdmin(req, COMMUNITY_SLUG);
    const parsed = await parseJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    if (!(await checkRateLimit(`member-export:${actor.uid}`, 20, 60 * 60 * 1000)).success) {
      return NextResponse.json({ error: "That's a lot of downloads in an hour. Wait a little and try again." }, { status: 429 });
    }
    const { count, scope, includesPhones } = parsed.data;
    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "members_exported",
      actor: auditActor(actor, admin),
      resource: { type: "members", id: "list", summary: `Member list downloaded as CSV: ${count} ${count === 1 ? "member" : "members"}${includesPhones ? ", with phone numbers" : ""}` },
      after: { count, scope, includesPhones },
      meta: auditMeta(req, ROUTE)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
