import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

// Signing links carry a secret: keep them out of search results and out of the Referer header.
export const metadata: Metadata = {
  ...siteMetadata,
  title: "Sign a certificate · GHMO",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export const viewport = siteViewport;

// Secure root layout for signing links: no third-party scripts.
export default function SignRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell secure>
      <div className="py-2 md:py-6">{children}</div>
    </SiteShell>
  );
}
