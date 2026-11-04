import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

// Admin pages set a short title ("Members"); the tab reads "Members · GHMO admin".
export const metadata: Metadata = {
  ...siteMetadata,
  title: { default: "GHMO admin", template: "%s · GHMO admin" },
  robots: { index: false, follow: false }
};
export const viewport = siteViewport;

// Secure root layout: no third-party scripts. See SiteShell for why root layouts are split.
export default function SecureRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell secure chrome={false}>
      {children}
    </SiteShell>
  );
}
