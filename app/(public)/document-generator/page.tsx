import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { MessagePage } from "@/src/components/public/MessagePage";
import { Button } from "@/src/components/ui/button";
import { getContactEmail } from "@/src/lib/contact";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Document generator · GHMO" };

/** The document generator is a board tool; visitors who follow an old link get an explanation, not a sign-in form. */
export default function PublicDocgenPage() {
  const contactEmail = getContactEmail();

  return (
    <MessagePage
      icon={<FileSignature />}
      title="This tool is for board members"
      description={
        <>
          GHMO&apos;s board uses the document generator to make letters, invitations and certificates on the organization&apos;s
          letterhead.
          {contactEmail ? (
            <>
              {" "}
              If you need a document from GHMO, email us at{" "}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                {contactEmail}
              </a>
              .
            </>
          ) : (
            " If you need a document from GHMO, please ask a board member."
          )}
        </>
      }
      actions={
        <>
          <Button asChild size="lg">
            <Link href="/admin/login?next=%2Fadmin%2Fdocument-generator">Board member sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Go to the home page</Link>
          </Button>
        </>
      }
    />
  );
}
