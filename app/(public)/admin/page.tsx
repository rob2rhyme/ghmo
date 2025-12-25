import { assertCommunityRole } from "@/src/lib/auth";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { redirect } from "next/navigation";
import AdminDashboardClient from "@/src/modules/admin/AdminDashboardClient";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const community = await getCommunity();
  const auth = await assertCommunityRole("admin");
  if (!auth) redirect(`/admin/login`);

  const res = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/admin/dashboard`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load admin dashboard data (${res.status}): ${body}`);
  }
  const { stats, webhookEvents, auditLogs, blocks, timeline } = await res.json();

  if (process.env.NODE_ENV !== "production") {
    const payload = { community, stats, webhookEvents, auditLogs, blocks, timeline };
    for (const [key, val] of Object.entries(payload)) {
      try {
        JSON.stringify(val);
      } catch (err) {
        console.error(`Serialization failed for ${key}:`, err);
      }
    }
  }

  return (
    <AdminDashboardClient
      community={toPlain(community)}
      stats={toPlain(stats)}
      webhookEvents={toPlain(webhookEvents)}
      auditLogs={toPlain(auditLogs)}
      blocks={toPlain(blocks)}
      timeline={toPlain(timeline)}
    />
  );
}
