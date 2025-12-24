//src/lib/community.ts
import { adminDb } from "./firebaseAdmin";
import { communityDocPath, communityHomePagePath } from "./firestorePaths";

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
  const doc = await adminDb.doc(communityDocPath(COMMUNITY_ID)).get();
  if (doc.exists) {
    const data = doc.data() as Omit<Community, "id" | "slug">;
    return { id: COMMUNITY_ID, slug: COMMUNITY_SLUG, ...data };
  }
  return DEFAULT_COMMUNITY;
}

export async function getHomeBlocks() {
  const doc = await adminDb.doc(communityHomePagePath(COMMUNITY_ID)).get();
  return doc.exists ? doc.data()?.blocks ?? [] : [];
}

export async function upsertHomeBlocks(blocks: unknown[]) {
  await adminDb.doc(communityHomePagePath(COMMUNITY_ID)).set({ blocks }, { merge: true });
}
