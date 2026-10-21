import type { ReactNode } from "react";
import "../globals.css";
import { GoFundMeProInstallSnippet } from "@/src/components/GoFundMeProInstallSnippet";
import { SiteShell } from "@/src/components/layout/SiteShell";
import { getCommunity } from "@/src/lib/community";
import { siteMetadata } from "@/src/lib/siteMetadata";

export const metadata = siteMetadata;

// Public root layout. This is the ONLY layout allowed to load third-party scripts.
export default async function PublicRootLayout({ children }: { children: ReactNode }) {
  const community = await getCommunity();
  return (
    <SiteShell
      bodyStart={
        <GoFundMeProInstallSnippet
          enabled={community.gofundmePro?.enabled}
          installSnippet={process.env.NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET}
        />
      }
    >
      {children}
    </SiteShell>
  );
}
