import type { ReactNode } from "react";
import "../globals.css";
import { GoFundMeProInstallSnippet } from "@/src/components/GoFundMeProInstallSnippet";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { getCommunity } from "@/src/lib/community";
import { siteMetadata, siteViewport } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;
export const viewport = siteViewport;

// Public root layout. This is the ONLY layout allowed to load third-party scripts (GoFundMe Pro, on /donate).
export default async function PublicRootLayout({ children }: { children: ReactNode }) {
  const community = await getCommunity();
  return (
    <SiteShell
      scrollToTop
      bodyStart={
        // Runs on /donate only (the component checks the path); the snippet text comes from the build, not props.
        <GoFundMeProInstallSnippet enabled={community.gofundmePro?.enabled} />
      }
    >
      {children}
    </SiteShell>
  );
}
