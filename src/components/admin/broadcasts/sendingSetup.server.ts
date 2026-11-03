import "server-only";
import { footerFromEnv } from "@/src/lib/broadcastMail";
import { sendingConfigFromEnv } from "@/src/lib/broadcastSending";
import { isMailConfigured } from "@/src/lib/mailer.server";

/**
 * Why email can't go out yet, in words an admin can act on (no setting names). Checks the same things,
 * in the same order, as `sendingBlocker` in broadcastSender.server.ts; null when everything is in place.
 */
export function emailSetupProblem(): string | null {
  const config = sendingConfigFromEnv();
  if (!config.enabled) return "Email sending is switched off on this site. Ask whoever manages the website to turn it on.";
  if (!isMailConfigured()) return "Email sending isn't set up on this site yet. Ask whoever manages the website to set it up.";
  if (!footerFromEnv()) return "Every email needs the organization's name and postal address in its footer. Ask whoever manages the website to add them.";
  if (config.dailyLimit <= 0) return "The daily sending limit is 0. Ask whoever manages the website to raise it.";
  return null;
}
