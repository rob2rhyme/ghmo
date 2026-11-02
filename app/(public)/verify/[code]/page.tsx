import { headers } from "next/headers";
import type { Metadata } from "next";
import { Clock, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { PublicPage, PublicPageHeader } from "@/src/components/public/PublicPage";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Card } from "@/src/components/ui/card";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { CERTIFICATES_COLLECTION, VERIFICATION_CODE_PATTERN, publicCertificateView, type CertificateRecord } from "@/src/lib/certificates.server";
import { formatShortDate } from "@/src/lib/format";
import { getContactEmail } from "@/src/lib/contact";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import CheckCodeForm from "./CheckCodeForm";
import VerifyPdf from "./VerifyPdf";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify a certificate", robots: { index: false, follow: false } };

async function lookup(code: string) {
  if (!VERIFICATION_CODE_PATTERN.test(code)) return null;
  const limit = await checkRateLimit(`verify:ip:${getClientIp(await headers())}`, 30, 10 * 60 * 1000);
  if (!limit.success) return "rate-limited" as const;
  const snap = await getAdminDb().collection(CERTIFICATES_COLLECTION).doc(code).get();
  return publicCertificateView(snap.data() as CertificateRecord | undefined);
}

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await lookup(code);

  const contactEmail = getContactEmail();

  return (
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader title="Certificate verification" description="This page checks a GHMO certificate against our records." />

      {result === "rate-limited" ? (
        <Alert variant="warning">
          <Clock />
          <AlertTitle>Too many checks</AlertTitle>
          <AlertDescription>Too many checks from this connection. Please try again in a few minutes.</AlertDescription>
        </Alert>
      ) : !result ? (
        <Alert variant="destructive" role="status">
          <ShieldAlert />
          <AlertTitle>No matching certificate</AlertTitle>
          <AlertDescription>
            We have no valid record for this code. The certificate may be a forgery, or the code may have been copied incorrectly.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert variant={result.status === "valid" ? "success" : "destructive"} role="status">
            {result.status === "valid" ? <ShieldCheck /> : <ShieldX />}
            <AlertTitle>{result.status === "valid" ? "Genuine certificate" : "This certificate has been revoked"}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Certificate number</dt>
                <dd className="break-words font-medium text-foreground">{result.certificateId}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="break-words text-foreground">{result.templateTitle}</dd>
                <dt className="text-muted-foreground">Issued</dt>
                <dd className="text-foreground">{formatShortDate(result.issuedAt)}</dd>
              </dl>
              <p>Compare the certificate number and date with the document you were given.</p>
            </AlertDescription>
          </Alert>
          <VerifyPdf expectedSha256={result.pdfSha256} />
        </>
      )}

      <Card>
        <CheckCodeForm />
      </Card>

      {contactEmail ? (
        <p className="text-sm text-muted-foreground">
          Questions? Email us at{" "}
          <a href={`mailto:${contactEmail}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            {contactEmail}
          </a>
          .
        </p>
      ) : null}
    </PublicPage>
  );
}
