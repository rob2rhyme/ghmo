import { NextResponse } from "next/server";
import { getState, listDevices, listEpochs } from "@/src/lib/e2eeStore";
import { listAdmins } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { e2eeRoute } from "@/src/lib/e2eeRoute";

export const dynamic = "force-dynamic";

/** Keyring overview: public keys and statuses only. */
export const GET = e2eeRoute(async (_req, guard) => {
  const [state, devices, epochs, admins] = await Promise.all([getState(), listDevices(), listEpochs(), listAdmins(COMMUNITY_SLUG)]);
  const adminById = new Map(admins.map(a => [a.id, a]));
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
