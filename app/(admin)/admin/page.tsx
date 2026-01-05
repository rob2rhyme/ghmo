import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { redirect } from "next/navigation";
import AdminDashboardClient from "@/src/modules/admin/AdminDashboardClient";
import { internalFetch } from "@/src/lib/internalFetch";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const community = await getCommunity();
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  const res = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/admin/dashboard`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to load admin dashboard data (${res.status}): ${body}`);
  }
  const { stats, webhookEvents, auditLogs, blocks, minutes } = await res.json();

  if (process.env.NODE_ENV !== "production") {
    const payload = { community, stats, webhookEvents, auditLogs, blocks, minutes };
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
      minutes={toPlain(minutes)}
      adminActor={toPlain(actorInfo)}
    />
  );
}
