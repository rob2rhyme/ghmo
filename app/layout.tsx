//app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/src/components/Providers";
import { CommunityHeader } from "@/src/components/community/CommunityHeader";
import { GoFundMeProInstallSnippet } from "@/src/components/GoFundMeProInstallSnippet";
import { getCommunity } from "@/src/lib/community";

export const metadata: Metadata = {
  title: "Greater Harrisburg Magar Organization",
  description:
    "Community hub for the Greater Harrisburg Magar Organization with fundraising, member access, and document generation."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const community = await getCommunity();
  const installSnippet = process.env.NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <GoFundMeProInstallSnippet enabled={community.gofundmePro?.enabled} installSnippet={installSnippet} />
          <CommunityHeader name={community.name} />
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
