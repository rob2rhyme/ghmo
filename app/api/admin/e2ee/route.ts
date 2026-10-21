import { NextResponse } from "next/server";
import { getState, listDevices, listEpochs } from "@/src/lib/e2eeStore";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { orgAdminsCollectionPath } from "@/src/lib/firestorePaths";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { e2eeRoute } from "@/src/lib/e2eeRoute";

export const dynamic = "force-dynamic";

/** Keyring overview: public keys and statuses only. */
export const GET = e2eeRoute(async (_req, guard) => {
  // Read every admin record (no orderBy: Firestore drops documents missing the sort field).
  const [state, devices, epochs, adminsSnap] = await Promise.all([
    getState(),
    listDevices(),
    listEpochs(),
    getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG)).get()
  ]);
  const adminById = new Map(
    adminsSnap.docs.map(doc => [doc.id, { name: (doc.data().name as string | undefined) ?? "Admin", status: doc.data().status as string }])
  );
  return NextResponse.json({
    me: { uid: guard.actor.uid, superAdmin: guard.admin.roles.includes("super_admin") },
    state: {
      enabled: state.enabled,
      currentEpoch: state.currentEpoch,
      recoveryPublic: state.recoveryPublic,
      recoveryCheckWrap: state.recoveryCheck?.wrap ?? null,
      trustees: state.trustees,
      enabledAt: state.enabledAt,
      recoveryRotatedAt: state.recoveryRotatedAt
    },
    epochs,
    devices: devices.map(d => ({
      ...d,
      ownerName: adminById.get(d.uid)?.name ?? "Unknown admin",
      ownerActive: adminById.get(d.uid)?.status === "active"
    }))
  });
});
