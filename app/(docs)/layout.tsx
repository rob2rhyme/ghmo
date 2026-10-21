import type { ReactNode } from "react";
import "../globals.css";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { siteMetadata } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return <SiteShell secure>{children}</SiteShell>;
}
