import "server-only";

/**
 * The public GoFundMe campaign page for the Gumba Project, from GOFUNDME_PUBLIC_URL.
 * Returns null until a real campaign link is set, so pages hide the Donate button instead of
 * sending people to a page that doesn't exist.
 */
export function getDonateUrl(value = process.env.GOFUNDME_PUBLIC_URL): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const isGoFundMe = host === "gofundme.com" || host.endsWith(".gofundme.com");
    if (url.protocol !== "https:" || !isGoFundMe) return null;
    if (/replace-with/i.test(url.pathname) || url.pathname === "/" || url.pathname === "") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** A GoFundMe Pro campaign id for the embedded donation form, from GOFUNDME_PRO_CAMPAIGN_ID. */
export function getDonationEmbedCampaignId(value = process.env.GOFUNDME_PRO_CAMPAIGN_ID): string | null {
  const raw = value?.trim();
  return raw && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
}
