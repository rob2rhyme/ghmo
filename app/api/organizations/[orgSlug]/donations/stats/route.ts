import { NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDonationsStatsDocPath } from "@/src/lib/firestorePaths";
import { toPlainJson } from "@/src/lib/json";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snap = await adminDb.doc(orgDonationsStatsDocPath(params.orgSlug)).get();
  const fallbackSnap = snap.exists ? null : await adminDb.doc(`community/${COMMUNITY_ID}/donations/stats`).get();
  const data = snap.exists ? snap.data() || {} : fallbackSnap?.exists ? fallbackSnap.data() || {} : {};
  const stats = {
    totalRaised: data.totalRaised ?? 0,
    goal: data.goal ?? null,
    lastUpdatedAt: data.lastUpdatedAt ?? null
  };

  return NextResponse.json(toPlainJson({ ok: true, stats }));
}
