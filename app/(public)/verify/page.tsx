import type { Metadata } from "next";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import CheckCodeForm from "./[code]/CheckCodeForm";

export const metadata: Metadata = { title: "Verify a certificate · GHMO", robots: { index: false, follow: false } };

/** /verify with no code (someone typed the address from a printed certificate): just the form to enter one. */
export default function VerifyStartPage() {
  return (
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader title="Certificate verification" description="Enter the code printed on a GHMO certificate to check it against our records." />
      <CheckCodeForm label="Certificate code" />
    </PublicPage>
  );
}
