import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export const metadata: Metadata = { title: "Document generator · GHMO" };

/** The document generator is a board tool; visitors who follow an old link get an explanation, not a sign-in form. */
export default function PublicDocgenPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <FileSignature className="size-7" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">This tool is for board members</h1>
      <p className="text-muted-foreground">
        GHMO&apos;s board uses the document generator to make letters, invitations and certificates on the organisation&apos;s
        letterhead. If you need a document from GHMO, please ask a board member.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/admin/login?next=%2Fadmin%2Fdocument-generator">Board member sign in</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
