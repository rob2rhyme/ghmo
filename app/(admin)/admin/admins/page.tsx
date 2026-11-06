import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminsClient from "@/src/components/admin/admins/AdminsClient";
import { AdminAccessError, isSuperAdmin, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Admins · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Admins" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Who is an admin (plan §22). Super admins only: anyone else typing the address gets "not found", and the routes refuse them too. */
export default async function AdminsPage() {
  try {
    const { admin } = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    if (!isSuperAdmin(admin)) notFound();
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/admins");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Admins" description="Who can sign in to this admin area, and what they can do. Add someone, turn someone off or back on, or change a role." />
      <AdminsClient />
    </div>
  );
}
