import "server-only";

//src/lib/community.ts
import { adminDb } from "./firebaseAdmin";
import {
  communityDocPath,
  communityHomePagePath,
  orgDocPath,
  orgHomeBlocksDocPath
} from "./firestorePaths";
import { toPlain } from "./serialize.server";

export type Community = {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  theme?: {
    primary?: string;
    secondary?: string;
  };
  enabledModules?: string[];
  gofundmePro?: {
    enabled: boolean;
    campaignIds?: string[];
    installSnippetConfigured?: boolean;
    publicStatsEnabled?: boolean;
  };
  access?: {
    memberPinPolicy?: string;
    adminPinPolicy?: string;
  };
  defaultRoutes?: {
    home?: string;
    member?: string;
    admin?: string;
  };
};

export const COMMUNITY_SLUG = "ghmo";
export const COMMUNITY_ID = "ghmo-site";
export const COMMUNITY_NAME = "Greater Harrisburg Magar Organization";

const DEFAULT_COMMUNITY: Community = {
  id: COMMUNITY_ID,
  slug: COMMUNITY_SLUG,
  name: COMMUNITY_NAME,
  enabledModules: ["home", "gumba", "docgen", "donations", "admin", "multimedia"],
  gofundmePro: { enabled: true, campaignIds: ["ghmo-campaign"], installSnippetConfigured: true, publicStatsEnabled: true },
  defaultRoutes: { home: "/", member: "/gumba-project", admin: "/admin" }
};

export async function getCommunity(): Promise<Community> {
  const orgDoc = await adminDb.doc(orgDocPath(COMMUNITY_SLUG)).get();
  if (orgDoc.exists) {
    const data = toPlain(orgDoc.data() || {}) as Omit<Community, "id" | "slug">;
    return { id: COMMUNITY_ID, slug: COMMUNITY_SLUG, ...data };
  }

  const legacyDoc = await adminDb.doc(communityDocPath(COMMUNITY_ID)).get();
  if (legacyDoc.exists) {
    const data = toPlain(legacyDoc.data() || {}) as Omit<Community, "id" | "slug">;
    return { id: COMMUNITY_ID, slug: COMMUNITY_SLUG, ...data };
  }

  return DEFAULT_COMMUNITY;
}

export async function getHomeBlocks() {
  const doc = await adminDb.doc(orgHomeBlocksDocPath(COMMUNITY_SLUG)).get();
  if (doc.exists) return doc.data()?.blocks ?? [];
  const legacy = await adminDb.doc(communityHomePagePath(COMMUNITY_ID)).get();
  return legacy.exists ? legacy.data()?.blocks ?? [] : [];
}

export async function upsertHomeBlocks(blocks: unknown[]) {
  await adminDb.doc(orgHomeBlocksDocPath(COMMUNITY_SLUG)).set({ blocks }, { merge: true });
}
