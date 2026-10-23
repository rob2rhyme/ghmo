import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/src/lib/admin";
import { deviceIdSchema, rosterEntrySchema } from "@/src/lib/e2ee/schemas";
import { readRoster, sealRoster, snapshotCandidate } from "@/src/lib/e2eeStore";
import { auditKeyring, e2eeRoute } from "@/src/lib/e2eeRoute";
import { parseJsonBody } from "@/src/lib/validation";

export const dynamic = "force-dynamic";

/**
 * The signed device log. Browsers replay and verify it themselves; the server's copy is just storage.
 * `?candidate=1` returns what a first entry would contain for a workspace that has no log yet.
 */
export const GET = e2eeRoute(async req => {
  if (req.nextUrl.searchParams.get("candidate") === "1") {
    return NextResponse.json({ candidate: await snapshotCandidate() });
  }
  return NextResponse.json({ entries: await readRoster() });
});

const sealSchema = z.object({ deviceId: deviceIdSchema, entry: rosterEntrySchema });

/** Starts the log for a workspace set up before it existed (super admin, once). */
export const POST = e2eeRoute(async (req, guard) => {
  if (!isSuperAdmin(guard.admin)) return NextResponse.json({ error: "Only a super admin can seal the device list" }, { status: 403 });
  const parsed = await parseJsonBody(req, sealSchema, { maxBytes: 512 * 1024 });
  if (!parsed.ok) return parsed.response;
  await sealRoster({ uid: guard.actor.uid, deviceId: parsed.data.deviceId, entry: parsed.data.entry });
  await auditKeyring(req, guard, "e2ee_roster_sealed", "Device list sealed");
  return NextResponse.json({ ok: true }, { status: 201 });
});
