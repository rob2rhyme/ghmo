import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import MyCallsClient from "@/src/components/admin/calling/MyCallsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "My calls · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "My calls" };


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
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="My calls" description="The people you phone, and what to tell them." />
      <MyCallsClient />
    </div>
  );
}
