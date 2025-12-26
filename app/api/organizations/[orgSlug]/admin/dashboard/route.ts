import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/lib/firebaseAdmin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";
import {
  orgAuditLogsCollectionPath,
  orgDonationsWebhookEventsCollectionPath,
  orgDonationsStatsDocPath,
  orgHomeBlocksDocPath,
  orgTimelineCollectionPath
} from "@/src/lib/firestorePaths";
import { enforceActiveAdmin } from "@/src/lib/adminHttp";

export const dynamic = "force-dynamic";

function fail(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: "Failed to load admin dashboard", details: `${label}: ${message}` }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: { orgSlug: string } }) {
  if (params.orgSlug !== COMMUNITY_SLUG) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const orgSlug = params.orgSlug;

  const guard = await enforceActiveAdmin(req, orgSlug);
  if ("response" in guard) return guard.response;

  const statsPath = orgDonationsStatsDocPath(orgSlug);
  const webhookPath = orgDonationsWebhookEventsCollectionPath(orgSlug);
  const auditPath = orgAuditLogsCollectionPath(orgSlug);
  const homeBlocksPath = orgHomeBlocksDocPath(orgSlug);
  const timelinePath = orgTimelineCollectionPath(orgSlug);

  const warnings: string[] = [];

  let stats: Record<string, any> = { totalRaised: 0, goal: 0, donorCount: 0 };
  try {
    const statsSnap = await adminDb.doc(statsPath).get();
    stats = statsSnap.exists ? statsSnap.data() || stats : stats;
  } catch (err) {
    warnings.push(`stats: ${err instanceof Error ? err.message : String(err)}`);
  }

  let webhookEvents: any[] = [];
  try {
    const webhookSnap = await adminDb.collection(webhookPath).orderBy("receivedAt", "desc").limit(5).get();
    webhookEvents = webhookSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    warnings.push(`webhookEvents: ${err instanceof Error ? err.message : String(err)}`);
  }

  let auditLogs: any[] = [];
  try {
    const auditSnap = await adminDb.collection(auditPath).orderBy("createdAt", "desc").limit(10).get();
    const source = auditSnap.docs;
    auditLogs = source.map(doc => {
      const data = doc.data() as Record<string, any>;
      const ts = data.createdAt || data.timestamp;
      const createdAtMs =
        typeof ts?.toMillis === "function"
          ? ts.toMillis()
          : ts instanceof Date
            ? ts.getTime()
            : typeof ts === "number"
              ? ts
              : null;
      return toPlain({ id: doc.id, ...data, createdAtMs });
    });
  } catch (err) {
    warnings.push(`auditLogs: ${err instanceof Error ? err.message : String(err)}`);
  }

  let blocks: any[] = [];
  try {
    const contentBlocksDoc = await adminDb.doc(homeBlocksPath).get();
    if (contentBlocksDoc.exists) {
      blocks = contentBlocksDoc.data()?.blocks || [];
    } else {
      blocks = [];
    }
  } catch (err) {
    warnings.push(`blocks: ${err instanceof Error ? err.message : String(err)}`);
  }

  let timeline: any[] = [];
  try {
    const timelineSnap = await adminDb.collection(timelinePath).orderBy("timestamp", "desc").limit(20).get();
    const docs = timelineSnap.docs;
    timeline = docs.map(doc => {
      const data = doc.data() as Record<string, any>;
      const ts = data.timestamp;
      const timestamp =
        typeof ts?.toMillis === "function"
          ? ts.toMillis()
          : ts instanceof Date
            ? ts.getTime()
            : typeof ts === "number"
              ? ts
              : null;
      return { id: doc.id, ...data, timestamp };
    });
  } catch (err) {
    warnings.push(`timeline: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json(toPlain({ ok: true, stats, webhookEvents, auditLogs, blocks, timeline, warnings }));
}
