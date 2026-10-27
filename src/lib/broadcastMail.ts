/**
 * Pieces every broadcast email carries (plan §10.3): a footer with a working unsubscribe link and the
 * organization's name and postal address, plus the RFC 8058 one-click headers that make mail apps show
 * their own "Unsubscribe" button. Pure functions; the caller supplies the origin and the token.
 */
export function unsubscribePageUrl(origin: string, token: string): string {
  return `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** The address mail apps POST to for one-click unsubscribe. It must accept POST with no login. */
export function unsubscribeApiUrl(origin: string, token: string): string {
  return `${origin}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function unsubscribeHeaders(origin: string, token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeApiUrl(origin, token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}

export type BroadcastFooter = { orgName: string; postalAddress: string };

/** Reads the sender identity from the environment (decision D11). Null until the owner has set both. */
export function footerFromEnv(env: Record<string, string | undefined> = process.env): BroadcastFooter | null {
  const orgName = env.BROADCAST_ORG_NAME?.trim();
  const postalAddress = env.BROADCAST_POSTAL_ADDRESS?.trim();
  return orgName && postalAddress ? { orgName, postalAddress } : null;
}

export function withUnsubscribeFooter(text: string, params: { origin: string; token: string; footer: BroadcastFooter }): string {
  const { origin, token, footer } = params;
  return [
    text.trimEnd(),
    "",
    "--",
    `You get this email because you asked to hear from ${footer.orgName}.`,
    `To stop these emails, open: ${unsubscribePageUrl(origin, token)}`,
    "",
    footer.orgName,
    footer.postalAddress
  ].join("\n");
}
