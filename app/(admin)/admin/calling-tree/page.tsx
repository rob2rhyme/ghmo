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
      <AdminPageHeader title="Calling tree" description="Who phones whom: each callable member keeps one caller, shared out evenly, with households kept together." />
      <CallingTreeClient />
    </div>
  );
}
