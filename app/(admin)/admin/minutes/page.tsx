//app/(admin)/admin/minutes/page.tsx
import { MeetingMinutesRecord } from "@/src/lib/minutes";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listAdminMinutes } from "@/src/lib/adminData.server";
import { toPlain } from "@/src/lib/serialize.server";
import { redirect } from "next/navigation";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import MinutesEditorClient from "@/src/components/admin/minutes/MinutesEditorClient";
import MinutesRecordsClient from "@/src/components/admin/minutes/MinutesRecordsClient";
import { SegmentedNav } from "@/src/components/ui/segmented";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminMinutesPageProps = {
  searchParams?: Promise<{ mode?: string }>;
};

export default async function AdminMinutesPage({ searchParams }: AdminMinutesPageProps) {
  const { mode: modeParam } = (await searchParams) ?? {};
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/minutes`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  const minutes = toPlain(await listAdminMinutes()) as MeetingMinutesRecord[];

  const mode = modeParam === "records" ? "records" : "new";

  return (
    <div className="flex flex-col gap-6">
      {/* The tabs sit in the header, so any encryption notice comes straight under it, as on every other page. */}
      <AdminPageHeader
        title="Meeting minutes"
        description="Write up each meeting, have another admin approve it, then download or publish it."
        actions={
          <SegmentedNav
            label="Minutes views"
            links={[
              { href: "/admin/minutes?mode=new", label: "Write minutes", active: mode === "new" },
              // "Records" is the name the browser tests click; keep it in step with tests/e2e-auth.
              { href: "/admin/minutes?mode=records", label: "Records", active: mode === "records" }
            ]}
          />
        }
      />

      <EncryptionGate what="the meeting minutes">
        {mode === "records" ? (
          <MinutesRecordsClient initialMinutes={minutes} />
        ) : (
          <MinutesEditorClient minutes={minutes} adminActor={toPlain(actorInfo)} />
        )}
      </EncryptionGate>
    </div>
  );
}
