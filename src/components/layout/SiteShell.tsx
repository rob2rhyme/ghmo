import type { ReactNode } from "react";
import Image from "next/image";
import Providers from "@/src/components/Providers";
import { CommunityHeader } from "@/src/components/community/CommunityHeader";
import { getCommunity } from "@/src/lib/community";

type SiteShellProps = {
  children: ReactNode;
  /** Extra nodes rendered first inside <body>. Only public root layouts pass third-party scripts here. */
  bodyStart?: ReactNode;
  /** Render the community header and footer. */
  chrome?: boolean;
};

/**
 * Shared <html>/<body> for every root layout.
 *
 * The app uses several root layouts on purpose: Next.js does a full page load when
 * navigating between root layouts, so third-party scripts loaded on public pages
 * can never stay alive in the browser after the user moves into the admin area.
 */
export async function SiteShell({ children, bodyStart, chrome = true }: SiteShellProps) {
  const community = await getCommunity();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          {bodyStart}
          {chrome ? (
            <>
              <CommunityHeader name={community.name} />
              <main className="mx-auto max-w-6xl px-1 py-3 md:px-6 md:py-8">{children}</main>
              <SiteFooter />
            </>
          ) : (
            children
          )}
        </Providers>
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <div className="border-t border-white/10 bg-[#121212] py-4 text-xs text-neutral-300">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center sm:flex-row sm:justify-center sm:gap-3 sm:text-left lg:px-8">
        <Image src="/assets/rob2rhyme.png" alt="Robin Thapa logo" width={28} height={28} />
        <div className="text-neutral-300">
          Built from scratch with custom code by Robin Thapa
          <span className="mx-2 inline-block">|</span>
          Copyright © {new Date().getFullYear()} GHMO, All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
