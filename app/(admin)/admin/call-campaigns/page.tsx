import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import CallCampaignsClient from "@/src/components/admin/calling/CallCampaignsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Call campaigns · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Call campaigns" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CallCampaignsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/call-campaigns");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Call campaigns" description="One campaign per announcement: callers phone their people and note what happened, so admins see who was reached." />
      <CallCampaignsClient />
    </div>
  );
}
