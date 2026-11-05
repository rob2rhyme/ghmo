import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import PositionsClient from "@/src/components/admin/people/PositionsClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Positions · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Positions" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PositionsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/positions");
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="Positions" description="The president, treasurer, secretary and the rest of the board: who holds each one, and since when." />
      <PositionsClient />
    </div>
  );
}
