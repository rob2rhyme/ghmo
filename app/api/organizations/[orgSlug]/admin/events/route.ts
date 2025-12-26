import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent } from "@/src/lib/events";
import { toPlainJson } from "@/src/lib/json";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await enforceActiveAdmin(req, params.orgSlug);
  if ("response" in guard) return guard.response;
  const snap = await adminDb.collection(eventsCollectionPath(params.orgSlug)).orderBy("startsAt", "desc").limit(200).get();
  const events = snap.docs.map(normalizeEvent);

  return NextResponse.json(toPlainJson({ ok: true, events }));
}
