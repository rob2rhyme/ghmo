import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import FirebaseAdminAuthBootstrap from "@/src/components/admin/FirebaseAdminAuthBootstrap";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import CommsBoardClient from "@/src/components/admin/comms/CommsBoardClient";
import { requireActiveAdmin, AdminAccessError } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { toPlain } from "@/src/lib/serialize.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCommsPage() {
  let actorInfo: Awaited<ReturnType<typeof requireActiveAdmin>>["actor"] | null = null;
  try {
    const guard = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    actorInfo = guard.actor;
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/comms`);
    }
    redirect(`/admin/login`);
  }
  if (!actorInfo) {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Plans & Issues"
        description="Topics the admin team needs to discuss and decide. Each one closes with an agreed conclusion."
        actions={
          <Button asChild>
            <Link href="/admin/comms?new=1" scroll={false}>
              <Plus aria-hidden="true" />
              New topic
            </Link>
          </Button>
        }
      />
      <FirebaseAdminAuthBootstrap>
        <EncryptionGate what="Plans & Issues">
          <CommsBoardClient actor={toPlain(actorInfo)} />
        </EncryptionGate>
      </FirebaseAdminAuthBootstrap>
    </div>
  );
}
