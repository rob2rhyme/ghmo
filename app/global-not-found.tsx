import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Providers from "@/src/components/Providers";
import ThemeLogo from "@/src/components/ThemeLogo";
import { NotFoundBody } from "@/src/components/public/NotFoundBody";
import { COMMUNITY_NAME } from "@/src/lib/community";
import { inter } from "@/src/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found · GHMO",
  description: "The page you are looking for does not exist."
};

/**
 * 404 for URLs that match no route. It renders its own <html>, so it sets up the theme the same way
 * SiteShell does: next-themes' inline script carries this request's CSP nonce on secure paths (proxy.ts
 * sets x-nonce there; public paths have no script restriction and no nonce). The message itself is the
 * same NotFoundBody the route groups' not-found.tsx files use.
 */
export default async function GlobalNotFound() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <Providers nonce={nonce}>
          {/* The slim public header (logo and name, home link), so the page has one emblem, the 404 icon, and a
              way home that looks like the rest of the site (R4 L10). */}
          <header className="border-b border-border bg-background">
            <div className="mx-auto flex h-16 max-w-6xl items-center px-4 md:px-6">
              <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3 rounded-md text-foreground">
                <ThemeLogo alt="" className="size-9" sizes="48px" />
                <span className="truncate text-base font-semibold">
                  <span className="xl:hidden">GHMO</span>
                  <span className="hidden xl:inline">{COMMUNITY_NAME}</span>
                </span>
              </Link>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-12">
            <NotFoundBody />
          </main>
        </Providers>
      </body>
    </html>
  );
}
