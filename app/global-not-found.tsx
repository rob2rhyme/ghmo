import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found · GHMO",
  description: "The page you are looking for does not exist."
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground antialiased">
        <main className="max-w-md space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">404</p>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="text-muted-foreground dark:text-slate-400">The page you are looking for does not exist or has moved.</p>
          <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">
            Go to the home page
          </Link>
        </main>
      </body>
    </html>
  );
}
