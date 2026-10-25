import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import NotificationsPanel from "@/src/components/admin/security/NotificationsPanel";
import AuthenticatorPanel from "@/src/components/admin/security/AuthenticatorPanel";
import PasskeysPanel from "@/src/components/admin/security/PasskeysPanel";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

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
        description="Your authenticator app and passkeys, and new passkeys from other admins that are waiting for approval."
      />
      <AuthenticatorPanel superAdmin={superAdmin} />
      <PasskeysPanel />
      <NotificationsPanel />
    </div>
  );
}
