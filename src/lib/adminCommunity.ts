import { getAdminDb } from "./firebaseAdmin";
import { orgDocPath, orgHomeBlocksDocPath } from "./firestorePaths";
import { Community, COMMUNITY_SLUG, COMMUNITY_ID } from "./community";

export async function getCommunityFromFirestore(): Promise<Community | null> {
  const doc = await getAdminDb().doc(orgDocPath(COMMUNITY_SLUG)).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  return {
    id: COMMUNITY_ID,
    slug: COMMUNITY_SLUG,
    name: typeof data.name === "string" ? data.name : COMMUNITY_SLUG,
    theme: data.theme,
    enabledModules: Array.isArray(data.enabledModules) ? (data.enabledModules as string[]) : undefined,
    gofundmePro: data.gofundmePro as Community["gofundmePro"],
    access: data.access as Community["access"],
    defaultRoutes: data.defaultRoutes as Community["defaultRoutes"],
    logoUrl: data.logoUrl as string | undefined
  };
}

export async function getHomeBlocks() {
  const doc = await getAdminDb().doc(orgHomeBlocksDocPath(COMMUNITY_SLUG)).get();
  return doc.exists ? doc.data()?.blocks || [] : [];
}

export async function upsertHomeBlocks(blocks: unknown[]) {
  await getAdminDb().doc(orgHomeBlocksDocPath(COMMUNITY_SLUG)).set({ blocks }, { merge: true });
}
