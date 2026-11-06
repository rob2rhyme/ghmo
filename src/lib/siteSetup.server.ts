import "server-only";
import { listAdmins } from "./admin";
import { COMMUNITY_SLUG } from "./community";
import { getContactEmail } from "./contact";
import { getDonateUrl } from "./donateLink";
import { getState } from "./e2eeStore";
import { isMailConfigured } from "./mailer.server";
import { pushConfig } from "./push.server";
import { sendingConfigFromEnv } from "./broadcastSending";
import { emailSetupProblem } from "@/src/components/admin/broadcasts/sendingSetup.server";
import { devSwitchesIn, siteSetupItems, type SetupItem } from "./siteSetup";

/** What a super admin should fix in the site's settings (names only, never values). Reads the admin list and encryption state. */
export async function loadSiteSetup(env: NodeJS.ProcessEnv = process.env): Promise<SetupItem[]> {
  const [admins, e2ee] = await Promise.all([listAdmins(COMMUNITY_SLUG), getState()]);
  return siteSetupItems({
    appUrl: env.NEXT_PUBLIC_APP_URL || env.APP_PUBLIC_URL || "",
    production: env.VERCEL_ENV === "production",
    mailReady: isMailConfigured(),
    broadcastsOn: sendingConfigFromEnv().enabled,
    broadcastProblem: emailSetupProblem(),
    contactEmail: getContactEmail() !== null,
    donateLink: getDonateUrl() !== null,
    pushReady: pushConfig(env) !== null,
    cronReady: Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= 16),
    devSwitches: devSwitchesIn(env),
    activeSuperAdmins: admins.filter(admin => admin.status === "active" && admin.roles.includes("super_admin")).length,
    encryptionOn: e2ee.enabled
  });
}
