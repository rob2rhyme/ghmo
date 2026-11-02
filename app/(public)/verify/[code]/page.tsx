import { headers } from "next/headers";
import type { Metadata } from "next";
import { Clock, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Card } from "@/src/components/ui/card";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { CERTIFICATES_COLLECTION, VERIFICATION_CODE_PATTERN, publicCertificateView, type CertificateRecord } from "@/src/lib/certificates.server";
import { formatShortDate } from "@/src/lib/format";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
import { cn } from "@/src/lib/utils";
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Certificate verification</h1>
        <p className="text-base text-muted-foreground">This page checks a GHMO certificate against our records.</p>
      </header>

      {result === "rate-limited" ? (
        <Alert variant="warning">
          <Clock />
          <AlertDescription className="text-foreground">Too many checks from this connection. Please try again in a few minutes.</AlertDescription>
        </Alert>
      ) : !result ? (
        <div role="status" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 md:p-6">
          <ShieldAlert className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base font-semibold text-destructive">No matching certificate</p>
            <p className="text-sm text-foreground/90">
              We have no valid record for this code. The certificate may be a forgery, or the code may have been copied incorrectly.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            role="status"
            className={cn(
              "flex gap-3 rounded-xl border p-4 md:p-6",
              result.status === "valid" ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"
            )}
          >
            {result.status === "valid" ? (
              <ShieldCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <ShieldX className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className={cn("text-base font-semibold", result.status === "valid" ? "text-success" : "text-destructive")}>
                {result.status === "valid" ? "Genuine certificate" : "This certificate has been revoked"}
              </p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Certificate number</dt>
                <dd className="break-words font-medium text-foreground">{result.certificateId}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd className="break-words text-foreground">{result.templateTitle}</dd>
                <dt className="text-muted-foreground">Issued</dt>
                <dd className="text-foreground">{formatShortDate(result.issuedAt)}</dd>
              </dl>
              <p className="text-sm text-muted-foreground">Compare the certificate number and date with the document you were given.</p>
            </div>
          </div>
          <VerifyPdf expectedSha256={result.pdfSha256} />
        </>
      )}

      <Card>
        <CheckCodeForm />
      </Card>

      <p className="text-sm text-muted-foreground">Questions? Ask a GHMO board member.</p>
    </div>
  );
}
