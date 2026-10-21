import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;

// Secure root layout for signing links: no third-party scripts.
export default function SignRootLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <div className="min-h-screen bg-slate-950 px-2.5 py-3 md:py-10">{children}</div>
    </SiteShell>
  );
}
