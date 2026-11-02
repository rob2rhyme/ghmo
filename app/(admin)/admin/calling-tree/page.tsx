import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import CallingTreeClient from "@/src/components/admin/calling/CallingTreeClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CallingTreePage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/calling-tree");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Calling Tree"
        description="Who phones whom. Each member who can be called gets one board member as their caller, shared out evenly with households kept together, and keeps that caller from one announcement to the next."
      />
      <CallingTreeClient />
    </div>
  );
}
