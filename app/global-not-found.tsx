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
      <body className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <main className="max-w-md space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">404</p>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="text-slate-600 dark:text-slate-400">The page you are looking for does not exist or has moved.</p>
          <Link href="/" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">
            Go to the home page
          </Link>
        </main>
      </body>
    </html>
  );
}
