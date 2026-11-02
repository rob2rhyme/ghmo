import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import Providers from "@/src/components/Providers";
import ThemeLogo from "@/src/components/ThemeLogo";
import { Button } from "@/src/components/ui/button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found · GHMO",
  description: "The page you are looking for does not exist."
};

const LINKS: { href: Route; label: string }[] = [
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/donate", label: "Donate" },
  { href: "/minutes", label: "Minutes" }
];

/**
 * 404 for URLs that match no route. It renders its own <html>, so it sets up the theme the same way
 * SiteShell does: next-themes' inline script carries this request's CSP nonce on secure paths (proxy.ts
 * sets x-nonce there; public paths have no script restriction and no nonce).
 */
export default async function GlobalNotFound() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers nonce={nonce}>
          <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
            <Link href="/" className="rounded-md" aria-label="Greater Harrisburg Magar Organization home">
              <ThemeLogo alt="" priority className="size-24" />
            </Link>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-primary">Error 404</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Page not found</h1>
              <p className="text-base text-muted-foreground">
                The page you are looking for does not exist or has moved. These links can help you find your way.
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/">Go to the home page</Link>
            </Button>
            <nav aria-label="Popular pages">
              <ul className="flex flex-wrap justify-center gap-2">
                {LINKS.map(link => (
                  <li key={link.href}>
                    <Button asChild size="lg" variant="outline">
                      <Link href={link.href}>{link.label}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </nav>
          </main>
        </Providers>
      </body>
    </html>
  );
}
