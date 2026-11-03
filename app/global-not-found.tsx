import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Providers from "@/src/components/Providers";
import ThemeLogo from "@/src/components/ThemeLogo";
import { NotFoundBody } from "@/src/components/public/NotFoundBody";
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
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers nonce={nonce}>
          <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-12">
            <Link href="/" className="rounded-md" aria-label="Greater Harrisburg Magar Organization home">
              <ThemeLogo alt="" priority className="size-20" />
            </Link>
            <NotFoundBody />
          </main>
        </Providers>
      </body>
    </html>
  );
}
