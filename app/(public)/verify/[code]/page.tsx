import { headers } from "next/headers";
import type { Metadata } from "next";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { CERTIFICATES_COLLECTION, VERIFICATION_CODE_PATTERN, publicCertificateView, type CertificateRecord } from "@/src/lib/certificates.server";
import { checkRateLimit } from "@/src/lib/rateLimit";
import { getClientIp } from "@/src/lib/security/clientIp";
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
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Certificate verification</h1>
      {result === "rate-limited" ? (
        <p className="mt-4 text-sm text-muted-foreground">Too many checks from this connection. Please try again in a few minutes.</p>
      ) : !result ? (
        <div role="status" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-semibold text-destructive">No matching certificate</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We have no valid record for this code. The certificate may be a forgery, or the code may have been copied incorrectly.
          </p>
        </div>
      ) : (
        <>
          <div role="status" className={`mt-4 rounded-xl border p-4 ${result.status === "valid" ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
            <p className={`font-semibold ${result.status === "valid" ? "text-success" : "text-destructive"}`}>
              {result.status === "valid" ? "Genuine certificate" : "This certificate has been revoked"}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Certificate number</dt>
              <dd className="text-foreground">{result.certificateId}</dd>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="text-foreground">{result.templateTitle}</dd>
              <dt className="text-muted-foreground">Issued</dt>
              <dd className="text-foreground">{new Date(result.issuedAt).toLocaleDateString("en-US", { dateStyle: "long" })}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Compare the certificate number and date with the document you were given.</p>
          </div>
          <VerifyPdf expectedSha256={result.pdfSha256} />
        </>
      )}
    </main>
  );
}
