import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import TemplatesClient from "@/src/components/admin/events/TemplatesClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";

/** Tab title: "Task templates · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Task templates" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TaskTemplatesPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) redirect("/admin/login?next=/admin/events/templates");
    throw error;
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader back={{ href: "/admin/events", label: "Events" }} title="Task templates" description="Checklists you can add to any event, such as everything a general meeting needs." />
      <TemplatesClient />
    </div>
  );
}
