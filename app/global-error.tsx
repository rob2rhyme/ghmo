"use client";

import Link from "next/link";
import "./globals.css";

/**
 * Last resort when a root layout itself fails, so people see a plain page in the site's colours instead of the
 * framework's bare one. It replaces the whole document, so it renders its own <html> and can't use the site shell.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground antialiased">
        <main role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">The site could not be loaded. Try again in a moment. If it keeps happening, tell a board member{error.digest ? " and include the code below" : ""}.</p>
          {error.digest ? <code className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">Ref: {error.digest}</code> : null}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={reset} className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground">
              Try again
            </button>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-md border px-4 font-medium">
              Go to the home page
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
