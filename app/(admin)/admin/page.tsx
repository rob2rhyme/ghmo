//app/(admin)/admin/page.tsx
import type { Metadata } from "next";
import { requireActiveAdmin, AdminAccessError, isSuperAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { redirect } from "next/navigation";
import AdminDashboardOverview from "@/src/components/admin/dashboard/AdminDashboardOverview";
import { loadAdminDashboard } from "@/src/lib/adminData.server";
import { toPlain } from "@/src/lib/serialize.server";
import { loadSiteSetup } from "@/src/lib/siteSetup.server";
import { dashboardWarningText, type SetupItem } from "@/src/lib/siteSetup";

/** Tab title: "Dashboard · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Dashboard" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const community = await getCommunity();
  let actorInfo:
    | Awaited<ReturnType<typeof requireActiveAdmin>>["actor"]
    | null = null;
  let superAdmin = false;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
    superAdmin = isSuperAdmin(guard.admin);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  const { stats, webhookEvents, auditLogs, minutes, minutesCounts, warnings } = await loadAdminDashboard(await requireActiveAdmin(undefined, COMMUNITY_SLUG));
  // Super admins see what is missing in the site's settings; a failure to check never blocks the dashboard.
  let setup: SetupItem[] | null = null;
  if (superAdmin) {
    setup = await loadSiteSetup().catch(error => {
      console.error("Site setup check failed", error instanceof Error ? error.message : String(error));
      return null;
    });
  }

  if (process.env.NODE_ENV !== "production") {
    const payload = {
      community,
      stats,
      webhookEvents,
      auditLogs,
      minutes,
    };
    for (const [key, val] of Object.entries(payload)) {
      try {
        JSON.stringify(val);
      } catch (err) {
        console.error(`Serialization failed for ${key}:`, err);
      }
    }
  }

  return (
    <AdminDashboardOverview
      community={toPlain(community)}
      adminName={actorInfo.name}
      stats={toPlain(stats)}
      webhookEvents={toPlain(webhookEvents)}
      auditLogs={toPlain(auditLogs)}
      minutes={toPlain(minutes)}
      minutesCounts={minutesCounts}
      loadWarning={dashboardWarningText(warnings)}
      setup={setup}
    />
  );
}
