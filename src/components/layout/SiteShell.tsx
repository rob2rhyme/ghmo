import type { ReactNode } from "react";
import { headers } from "next/headers";
import Providers from "@/src/components/Providers";
import { CommunityHeader } from "@/src/components/community/CommunityHeader";
import { ScrollToTopButton } from "@/src/components/ScrollToTopButton";
import { ServiceWorkerRegistration } from "@/src/components/ServiceWorkerRegistration";
import { SiteFooter } from "@/src/components/public/SiteFooter";
import { getCommunity } from "@/src/lib/community";
import { getContactEmail } from "@/src/lib/contact";
import { ContactEmailProvider } from "@/src/lib/contactContext";
import { getDonateUrl } from "@/src/lib/donateLink";
import { inter } from "@/src/lib/fonts";
import { cn } from "@/src/lib/utils";

type SiteShellProps = {
  children: ReactNode;
  /** Extra nodes rendered first inside <body>. Only public root layouts pass third-party scripts here. */
  bodyStart?: ReactNode;
  /** Render the community header and footer. */
  chrome?: boolean;
  /**
   * Secure areas run under a nonce-based CSP (see proxy.ts). Reading the nonce makes
   * the page render per request, which nonces require.
   */
  secure?: boolean;
  /**
   * Header and footer links lead into another root layout (a full page load), so they aren't prefetched.
   * Secure layouts imply it; the docs layout sets it on its own.
   */
  crossRootLinks?: boolean;
  /** Floating back-to-top button with a scroll-progress ring (public pages). */
  scrollToTop?: boolean;
};

/**
 * Shared <html>/<body> for every root layout.
 *
 * The app uses several root layouts on purpose: Next.js does a full page load when
 * navigating between root layouts, so third-party scripts loaded on public pages
 * can never stay alive in the browser after the user moves into the admin area.
 */
export async function SiteShell({ children, bodyStart, chrome = true, secure = false, crossRootLinks = false, scrollToTop = false }: SiteShellProps) {
  const community = await getCommunity();
  const nonce = secure ? ((await headers()).get("x-nonce") ?? undefined) : undefined;
  const contactEmail = getContactEmail();

  // With the header and footer, body is a flex column so the footer sits at the bottom of short pages.
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={cn("min-h-screen bg-background text-foreground antialiased", chrome && "flex flex-col")}>
        <Providers nonce={nonce}>
          <ContactEmailProvider value={contactEmail}>
            {bodyStart}
            {chrome ? (
              <>
                <a
                  href="#main-content"
                  className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
                >
                  Skip to content
                </a>
                <CommunityHeader name={community.name} donateOpen={Boolean(getDonateUrl())} secure={secure || crossRootLinks} />
                <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none md:px-6 md:py-10">
                  {children}
                </main>
                <SiteFooter name={community.name} contactEmail={contactEmail} secure={secure || crossRootLinks} />
              </>
            ) : (
              children
            )}
            {scrollToTop ? <ScrollToTopButton /> : null}
            <ServiceWorkerRegistration />
          </ContactEmailProvider>
        </Providers>
      </body>
    </html>
  );
}
