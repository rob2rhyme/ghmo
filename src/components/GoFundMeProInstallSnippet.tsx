"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/** The only page that needs GoFundMe Pro's own script (the donation form). */
const DONATE_PATH = "/donate";

type Props = {
  enabled?: boolean;
  /** Defaults to NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET (inlined at build time), so other pages' HTML never carries it. */
  installSnippet?: string;
};

/**
 * GoFundMe Pro's install snippet. Rendered only by the public root layout (never a secure one), and it runs
 * only on /donate, after the page has finished loading, so the other public pages don't pay for it.
 */
export function GoFundMeProInstallSnippet({ enabled, installSnippet = process.env.NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET }: Props) {
  const pathname = usePathname();
  if (!enabled || !installSnippet || pathname !== DONATE_PATH) return null;
  return <Script id="gofundme-pro-install-snippet" strategy="lazyOnload" dangerouslySetInnerHTML={{ __html: installSnippet }} />;
}
