import "server-only";

//src/lib/community.ts
import { COMMUNITY_SLUG } from "./community.constants";
export { COMMUNITY_SLUG };

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

export const COMMUNITY_ID = "ghmo-site";
export const COMMUNITY_NAME = "Greater Harrisburg Magar Organization";

const DEFAULT_COMMUNITY: Community = {
  id: COMMUNITY_ID,
  slug: COMMUNITY_SLUG,
  name: COMMUNITY_NAME,
  enabledModules: ["home", "gumba", "docgen", "donations", "admin", "multimedia"],
  gofundmePro: { enabled: true, campaignIds: ["ghmo-campaign"], installSnippetConfigured: true, publicStatsEnabled: true },
  defaultRoutes: { home: "/", member: "/admin/gumba-project", admin: "/admin" }
};

export async function getCommunity(): Promise<Community> {
  return DEFAULT_COMMUNITY;
}
