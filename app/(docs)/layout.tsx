import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  // Fixed text with no admin data: public CSP and no per-request nonce, so it can be served from the cache.
  return <SiteShell crossRootLinks>{children}</SiteShell>;
}
