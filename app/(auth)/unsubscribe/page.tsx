import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off, MailX } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import UnsubscribeClient from "./UnsubscribeClient";
import { getContactEmail } from "@/src/lib/contact";
import { memberIdFromToken } from "@/src/lib/memberSuppression.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Unsubscribe from GHMO emails · GHMO", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Opening this page changes nothing (mail scanners open links). The person presses the button, which
 * calls POST /api/unsubscribe. A bad token gets a plain message and no button.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const valid = Boolean(memberIdFromToken(value));
  const contactEmail = getContactEmail();

  if (!valid) {
    return (
      <MessagePage
        icon={<Link2Off />}
        title="This link doesn't work"
        description={
          <>
            This link is not valid or was copied incompletely. Use the link in the most recent email, or reply to that email and
            ask to be removed.
            {contactEmail ? (
              <>
                {" "}
                You can also email us at{" "}
                <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                  {contactEmail}
                </a>
                .
              </>
            ) : null}
          </>
        }
        actions={
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center py-6">
      <Card>
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
          <MailX className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Stop these emails</h1>
        <UnsubscribeClient token={value} contactEmail={contactEmail} />
      </Card>
    </div>
  );
}
