import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;
export const viewport = siteViewport;

// Secure root layout for signing links: no third-party scripts.
export default function SignRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell secure>
      <div className="py-2 md:py-6">{children}</div>
    </SiteShell>
  );
}
