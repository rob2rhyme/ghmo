import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off, MailX } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center py-6">
      {valid ? (
        <Card>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailX className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stop these emails</h1>
          <UnsubscribeClient token={value} />
        </Card>
      ) : (
        <Card className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Link2Off className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">This link doesn&apos;t work</h1>
          <p className="text-base text-muted-foreground">
            This link is not valid or was copied incompletely. Use the link in the most recent email, or reply to that email and ask to be removed.
          </p>
          <Button asChild size="lg">
            <Link href="/">Go to homepage</Link>
          </Button>
        </Card>
      )}
    </div>
  );
}
