import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp } from "@/src/lib/security/clientIp";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";
import { logAuditEvent } from "@/src/lib/audit";
import { orgMembersCollectionPath } from "@/src/lib/firestorePaths";
import { MAX_IMPORT_ROWS, normalizeMemberEmail, normalizeMemberName } from "@/src/lib/members";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { AdminEnvError, getAdminEnvStatus } from "@/src/lib/env.server";
import { parseJsonBody } from "@/src/lib/validation";
import { envelopeChecker } from "@/src/lib/e2eeEnvelope.server";
import { MEMBER_ID_PATTERN, contactInputSchema } from "@/src/lib/memberContact.server";

export const dynamic = "force-dynamic";

const IMPORT_ROUTE_PATH = "/api/organizations/ghmo/members/import";
const IMPORT_LIMIT = 5;
const IMPORT_WINDOW_MS = 60 * 60 * 1000;

const importSchema = z.object({
  rows: z
    .array(
      z.object({
        email: z.string().trim().email().max(320),
        name: z.string().max(120).nullable().optional(),
        /** Browser-chosen id, required with an encrypted contact (the envelope is bound to it; plan §12). */
        id: z.string().regex(MEMBER_ID_PATTERN).optional(),
        contact: contactInputSchema.optional()
      })
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
  /** The admin ticked "these people agreed to receive email from us". Without it nothing is imported (plan §10.2, D7). */
  attested: z.literal(true),
  /** The admin ticked "these people gave their number for community calls". Required when any row has a contact. */
  phoneAttested: z.literal(true).optional()
});

/**
 * Adds many members at once. Every new member is recorded as having agreed to email (source "imported"),
 * which is why the request must carry the admin's attestation. Addresses that already exist are left
 * untouched, so an import can never re-subscribe someone who opted out.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  const params = await context.params;
  const adminEnvStatus = getAdminEnvStatus();
  if (!adminEnvStatus.ok) {
    return NextResponse.json({ error: "Admin env not configured", missing: adminEnvStatus.missing }, { status: 503 });
  }

  try {
    if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const guard = await enforceActiveAdmin(req, params.orgSlug);
    if ("response" in guard) return guard.response;
    const { actor, admin } = guard;

    const limited = await checkRateLimit(`members-import:${actor.uid}`, IMPORT_LIMIT, IMPORT_WINDOW_MS);
    if (!limited.success) {
      return NextResponse.json(
        { error: "Too many imports. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryInMs / 1000)) } }
      );
    }

    // Envelopes are a few hundred bytes each; 500 rows with contacts fit well under this.
    const parsed = await parseJsonBody(req, importSchema, { maxBytes: 1024 * 1024 });
    if (!parsed.ok) return parsed.response;

    const withContact = parsed.data.rows.filter(row => row.contact);
    if (withContact.length > 0) {
      if (!parsed.data.phoneAttested) return NextResponse.json({ error: "Confirm that these people gave their number for community calls." }, { status: 400 });
      if (withContact.some(row => !row.id)) return NextResponse.json({ error: "id is required with an encrypted contact" }, { status: 400 });
      const checker = await envelopeChecker(actor.uid);
      if (!checker.enabled) return NextResponse.json({ error: "Encryption is not enabled." }, { status: 400 });
      if (withContact.some(row => !checker.ok(row.contact!.enc))) {
        return NextResponse.json({ error: "Unknown or inactive encryption device." }, { status: 403 });
      }
    }

    const db = getAdminDb();
    const collection = db.collection(orgMembersCollectionPath(COMMUNITY_SLUG));
    const existing = new Set((await collection.select("emailLower").get()).docs.map(doc => doc.get("emailLower") as string));

    const now = new Date();
    const batch = db.batch();
    const seen = new Set<string>();
    let created = 0;
    let skipped = 0;
    let withPhone = 0;
    for (const row of parsed.data.rows) {
      const emailLower = normalizeMemberEmail(row.email);
      if (!emailLower || existing.has(emailLower) || seen.has(emailLower)) {
        skipped += 1;
        continue;
      }
      seen.add(emailLower);
      const name = normalizeMemberName(row.name);
      const ref = row.id ? collection.doc(row.id) : collection.doc();
      // create(), not set(): a browser-chosen id must never overwrite an existing member.
      batch.create(ref, {
        email: row.email,
        emailLower,
        ...(name ? { name } : {}),
        status: "active",
        uid: null,
        roles: ["member"],
        emailConsent: { at: now, source: "imported", byUid: actor.uid },
        hasPhone: row.contact?.hasPhone ?? false,
        ...(row.contact ? { contact: row.contact.enc, phoneConsent: { at: now, source: "imported", byUid: actor.uid } } : {}),
        createdAt: now,
        updatedAt: now
      });
      created += 1;
      if (row.contact) withPhone += 1;
    }
    if (created > 0) {
      try {
        await batch.commit();
      } catch (error) {
        // ALREADY_EXISTS: a browser-chosen id collided (vanishingly rare); nothing was written.
        if ((error as { code?: number }).code === 6) return NextResponse.json({ error: "A member with one of these ids already exists" }, { status: 409 });
        throw error;
      }
    }

    await logAuditEvent({
      orgSlug: COMMUNITY_SLUG,
      action: "members_imported",
      actor: { uid: actor.uid, adminId: admin.id, role: actor.roles[0] ?? "admin", name: admin.name, email: admin.email },
      resource: { type: "member", summary: `Imported ${created} members (${skipped} skipped, ${withPhone} with a phone number)` },
      // Counts only: the audit log should not become a second copy of the member list.
      after: { created, skipped, withPhone, attested: true, phoneAttested: withPhone > 0, source: "imported" },
      meta: { ip: getClientIp(req.headers), userAgent: req.headers.get("user-agent") ?? null, route: IMPORT_ROUTE_PATH }
    });

    return NextResponse.json({ ok: true, created, skipped, withPhone }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminEnvError) {
      return NextResponse.json({ error: "Admin env not configured", missing: error.issues }, { status: 503 });
    }
    throw error;
  }
}
