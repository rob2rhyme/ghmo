import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return <SiteShell secure>{children}</SiteShell>;
}
