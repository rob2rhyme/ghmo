import { adminDb } from "@/src/lib/firebaseAdmin";
import { assertCommunityRole } from "@/src/lib/auth";
import { getCommunity } from "@/src/lib/community";
import { communityHomePagePath } from "@/src/lib/firestorePaths";
import { redirect } from "next/navigation";
import AdminDashboardClient from "@/src/modules/admin/AdminDashboardClient";

export default async function AdminPage() {
  const community = await getCommunity();
  const auth = await assertCommunityRole("admin");
  if (!auth) redirect(`/admin/login`);

  const statsSnap = await adminDb.doc(`community/${community.id}/donations/stats`).get();
  const stats = statsSnap.exists ? statsSnap.data() : { totalRaised: 0, goal: 0, donorCount: 0 };

  const webhookSnap = await adminDb
    .collection(`community/${community.id}/donations/webhookEvents`)
    .orderBy("receivedAt", "desc")
    .limit(5)
    .get();
  const webhookEvents = webhookSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const auditSnap = await adminDb.collection(`community/${community.id}/auditLogs`).orderBy("timestamp", "desc").limit(10).get();
  const auditLogs = auditSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const contentBlocksDoc = await adminDb.doc(communityHomePagePath(community.id)).get();
  const blocks = contentBlocksDoc.exists ? contentBlocksDoc.data()?.blocks || [] : [];

  const timelineSnap = await adminDb
    .collection(`community/${community.id}/gumba/timeline`)
    .orderBy("timestamp", "desc")
    .limit(20)
    .get();
  const timeline = timelineSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return (
    <AdminDashboardClient
      community={community}
      stats={stats}
      webhookEvents={webhookEvents}
      auditLogs={auditLogs}
      blocks={blocks}
      timeline={timeline}
    />
  );
}
