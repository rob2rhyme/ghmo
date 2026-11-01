import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MyCallsClient from "@/src/components/admin/calling/MyCallsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyCallsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/my-calls");
    throw error;
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <AdminPageHeader title="My Calls" description="The people assigned to you. Numbers are decrypted on this device only and never leave it." />
      <MyCallsClient />
    </div>
  );
}
