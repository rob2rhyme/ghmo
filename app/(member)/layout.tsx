import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;

// Secure root layout: no third-party scripts. See SiteShell for why root layouts are split.
export default function SecureRootLayout({ children }: { children: ReactNode }) {
  return <SiteShell secure>{children}</SiteShell>;
}
