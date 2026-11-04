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
import { shownCertificateNumber } from "./shownCertificateNumber";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verify a certificate · GHMO", robots: { index: false, follow: false } };

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
  const certificateNumber = result && result !== "rate-limited" ? shownCertificateNumber(result.certificateId) : null;

  return (
    <PublicPage width="reading" className="gap-6">
      <PublicPageHeader title="Certificate verification" description="This page checks a GHMO certificate against our records." />

      {result === "rate-limited" ? (
        <Alert variant="warning">
          <Clock />
          <AlertTitle>Too many checks</AlertTitle>
          <AlertDescription>There have been many checks from this connection. Try again in a few minutes.</AlertDescription>
        </Alert>
      ) : !result ? (
        <Alert variant="destructive" role="status">
          <ShieldAlert />
          <AlertTitle>No matching certificate</AlertTitle>
          <AlertDescription>
            We couldn&apos;t find a certificate with this code. Check that it was typed exactly as printed, or scan the QR code
            again. If it still doesn&apos;t match, contact GHMO before you rely on the certificate.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert variant={result.status === "valid" ? "success" : "destructive"} role="status">
            {result.status === "valid" ? <ShieldCheck /> : <ShieldX />}
            <AlertTitle>{result.status === "valid" ? "Genuine certificate" : "This certificate is no longer valid"}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              {result.status === "valid" ? null : (
                <p>
                  GHMO issued this certificate and has since withdrawn it, so don&apos;t rely on it.{" "}
                  {contactEmail ? (
                    <>
                      To ask why, or whether a new one was issued, email{" "}
                      <a href={`mailto:${contactEmail}`} className="font-semibold underline underline-offset-4">
                        {contactEmail}
                      </a>
                      .
                    </>
                  ) : (
                    "To ask why, or whether a new one was issued, contact the GHMO board."
                  )}
                </p>
              )}
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                {certificateNumber ? (
                  <>
                    <dt className="text-muted-foreground">Certificate number</dt>
                    <dd className="break-words font-medium text-foreground">{certificateNumber}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Type</dt>
                <dd className="break-words text-foreground">{result.templateTitle}</dd>
                {/* The day the signed certificate was recorded here, which can differ from the issue date printed on it. */}
                <dt className="text-muted-foreground">Recorded on</dt>
                <dd className="text-foreground">{formatShortDate(result.issuedAt)}</dd>
              </dl>
              {result.status !== "valid" ? null : certificateNumber ? (
                <p>Check that the certificate number above matches the one printed on the document you were given.</p>
              ) : (
                <p>This certificate was recorded without a number. Check the type and date above against the document you were given.</p>
              )}
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
