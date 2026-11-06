/**
 * The dashboard's "Site setup" card for super admins: what is missing or unsafe in the site's settings, in plain
 * words plus the name of the setting to change. It names settings, never their values.
 */

export type SetupFacts = {
  /** NEXT_PUBLIC_APP_URL (or APP_PUBLIC_URL) as configured; empty when unset. */
  appUrl: string;
  /** True on the live site (Vercel production), where the dev-only switches must be off. */
  production: boolean;
  mailReady: boolean;
  /** Why broadcasts can't go out, or null when they can. Only shown when broadcasts are switched on. */
  broadcastProblem: string | null;
  broadcastsOn: boolean;
  contactEmail: boolean;
  donateLink: boolean;
  pushReady: boolean;
  cronReady: boolean;
  /** Dev sign-in or emulator switches present in the environment. */
  devSwitches: string[];
  activeSuperAdmins: number;
  encryptionOn: boolean;
};

export type SetupItem = { id: string; title: string; fix: string; level: "problem" | "suggestion" };

export function siteSetupItems(facts: SetupFacts): SetupItem[] {
  const items: SetupItem[] = [];
  const problem = (id: string, title: string, fix: string) => items.push({ id, title, fix, level: "problem" });
  const suggestion = (id: string, title: string, fix: string) => items.push({ id, title, fix, level: "suggestion" });

  if (facts.production && facts.devSwitches.length > 0) {
    problem("dev-switches", "Test-only switches are set on the live site", `Remove ${facts.devSwitches.join(", ")} from the Production variables in Vercel and redeploy.`);
  }
  let url: URL | null = null;
  try {
    url = facts.appUrl ? new URL(facts.appUrl) : null;
  } catch {
    url = null;
  }
  if (!url) problem("app-url", "The site's address isn't set", "Set NEXT_PUBLIC_APP_URL to the site's address (for example https://ghmo.org) in Vercel. Sign-in links, signing links and emails need it.");
  else if (facts.production && url.protocol !== "https:") problem("app-url", "The site's address doesn't start with https", "Change NEXT_PUBLIC_APP_URL in Vercel to the https address.");
  if (facts.activeSuperAdmins < 2) {
    problem("super-admins", "Only one active super admin", "Add a second super admin on the Admins page, so someone can still manage admins and keys if one person is away or loses their phone.");
  }
  if (!facts.mailReady) problem("mail", "Email isn't set up", "Set RESEND_API_KEY and NOTIFY_FROM_EMAIL in Vercel. Until then no notification, reminder or sign-in email can be sent.");
  if (facts.broadcastsOn && facts.broadcastProblem) problem("broadcasts", "Broadcasts can't go out", facts.broadcastProblem);
  if (!facts.encryptionOn) suggestion("encryption", "Encryption is off", "Turn it on under Encryption, so phone numbers and private notes are stored encrypted.");
  if (!facts.contactEmail) suggestion("contact", "No public contact address", "Set CONTACT_EMAIL in Vercel, so the website shows people how to reach GHMO.");
  if (!facts.donateLink) suggestion("donate", "No donation link", "Set GOFUNDME_PUBLIC_URL in Vercel to show the donate button.");
  if (!facts.pushReady) suggestion("push", "Push notifications aren't set up", "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Vercel (see the go-live checklist).");
  if (!facts.cronReady) suggestion("cron", "The daily task email can't run", "Set CRON_SECRET (16 characters or more) in Vercel if the board wants the daily task digest.");
  return items;
}

/** The dev-only switches that must never be set on the live site. */
export function devSwitchesIn(env: Record<string, string | undefined>): string[] {
  const names: string[] = [];
  if (env.ALLOW_DEV_ADMIN_LOGIN === "true") names.push("ALLOW_DEV_ADMIN_LOGIN");
  if (env.DEV_ADMIN_LOGIN_TOKEN) names.push("DEV_ADMIN_LOGIN_TOKEN");
  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") names.push("NEXT_PUBLIC_USE_FIREBASE_EMULATORS");
  if (env.PUSH_TEST_ALLOW_INSECURE) names.push("PUSH_TEST_ALLOW_INSECURE");
  if (env.MAIL_API_URL) names.push("MAIL_API_URL");
  return names;
}

/** Turns the dashboard's internal names for parts that failed to load into words. */
export function dashboardWarningText(labels: string[]): string | null {
  const words: Record<string, string> = { stats: "donation totals", webhookEvents: "donation updates", auditLogs: "recent activity", minutes: "recent minutes", minutesCounts: "minutes counts" };
  const parts = [...new Set(labels.map(label => words[label] ?? "part of the page"))];
  return parts.length ? `Some of this page couldn't be loaded (${parts.join(", ")}). What you see there may be incomplete; reload the page in a minute.` : null;
}
