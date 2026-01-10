//app/layout.tsx
import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import Providers from "@/src/components/Providers";
import { CommunityHeader } from "@/src/components/community/CommunityHeader";
import { GoFundMeProInstallSnippet } from "@/src/components/GoFundMeProInstallSnippet";
import { getCommunity } from "@/src/lib/community";

export const metadata: Metadata = {
  title: "Greater Harrisburg Magar Organization",
  description:
    "Community hub for the Greater Harrisburg Magar Organization with fundraising, multi-media, and admin tools.",
  icons: {
    icon: "/assets/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const community = await getCommunity();
  const installSnippet = process.env.NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <GoFundMeProInstallSnippet
            enabled={community.gofundmePro?.enabled}
            installSnippet={installSnippet}
          />
          <CommunityHeader name={community.name} />
          <main className="mx-auto max-w-6xl px-1 py-3 md:px-6 md:py-8">
            {children}
          </main>
          <div className="border-t border-white/10 bg-[#121212] py-4 text-xs text-neutral-300">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center sm:flex-row sm:justify-center sm:gap-3 sm:text-left lg:px-8">
              <Image
                src="/assets/rob2rhyme.png"
                alt="Robin Thapa logo"
                width={28}
                height={28}
              />
              <div className="text-neutral-300">
                Built from scratch with custom code by Robin Thapa
                <span className="mx-2 inline-block">|</span>
                Copyright © {new Date().getFullYear()} GHMO, All Rights
                Reserved.
              </div>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
