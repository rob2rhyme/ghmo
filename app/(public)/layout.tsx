import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;
export const viewport = siteViewport;

// Public root layout. No third-party script runs anywhere on this site: donations go through GoFundMe's own page
// (decision 2026-11-04), because a script here would run on the same address as the admin area.
export default function PublicRootLayout({ children }: { children: ReactNode }) {
  return <SiteShell scrollToTop>{children}</SiteShell>;
}
