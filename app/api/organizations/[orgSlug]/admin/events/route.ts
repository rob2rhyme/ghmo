import { NextResponse } from "next/server";
import { assertCommunityRole } from "@/src/lib/auth";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_ID, COMMUNITY_SLUG } from "@/src/lib/community";
import { eventsCollectionPath, normalizeEvent } from "@/src/lib/events";
import { toPlainJson } from "@/src/lib/json";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = await assertCommunityRole("admin");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminDb.collection(eventsCollectionPath(params.orgSlug)).orderBy("startsAt", "desc").limit(200).get();
  const fallbackSnap = snap.empty
    ? await adminDb.collection(`community/${COMMUNITY_ID}/events`).orderBy("startsAt", "desc").limit(200).get()
    : null;
  const sourceDocs = snap.empty && fallbackSnap ? fallbackSnap.docs : snap.docs;
  const events = sourceDocs.map(normalizeEvent);

  return NextResponse.json(toPlainJson({ ok: true, events }));
}
