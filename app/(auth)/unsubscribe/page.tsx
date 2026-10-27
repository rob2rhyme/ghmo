import type { Metadata } from "next";
import UnsubscribeClient from "./UnsubscribeClient";
import { memberIdFromToken } from "@/src/lib/memberSuppression.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Opening this page changes nothing (mail scanners open links). The person presses the button, which
 * calls POST /api/unsubscribe. A bad token gets a plain message and no button.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const valid = Boolean(memberIdFromToken(value));

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Stop these emails</h1>
      {valid ? (
        <UnsubscribeClient token={value} />
      ) : (
        <p className="text-muted-foreground">
          This link is not valid or was copied incompletely. Use the link in the most recent email, or reply to that email and ask to be removed.
        </p>
      )}
    </main>
  );
}
