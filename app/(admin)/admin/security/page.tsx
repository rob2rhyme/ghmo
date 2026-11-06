import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import NotificationsPanel from "@/src/components/admin/security/NotificationsPanel";
import PushAdminPanel from "@/src/components/admin/security/PushAdminPanel";
import PushPanel from "@/src/components/admin/security/PushPanel";
import AuthenticatorPanel from "@/src/components/admin/security/AuthenticatorPanel";
import PasskeysPanel from "@/src/components/admin/security/PasskeysPanel";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Security · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Security" };


export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  let superAdmin = false;
  try {
    const { admin } = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    superAdmin = isSuperAdmin(admin);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/security");
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Security"
        description="How you sign in to the admin area, and which emails and push alerts you get."
      />
      <section aria-labelledby="security-sign-in" className="flex flex-col gap-4">
        <h2 id="security-sign-in" className="text-lg font-semibold">
          Sign-in
        </h2>
        <AuthenticatorPanel superAdmin={superAdmin} />
        <PasskeysPanel />
      </section>
      <section aria-labelledby="security-notifications" className="flex flex-col gap-4">
        <h2 id="security-notifications" className="text-lg font-semibold">
          Notifications
        </h2>
        <NotificationsPanel />
        <PushPanel />
        {superAdmin ? <PushAdminPanel /> : null}
      </section>
    </div>
  );
}
