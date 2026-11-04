"use client";

import { useState } from "react";
import { FileCheck2, FileX2 } from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/alert";

/** Hashes a chosen PDF in the browser (it is never uploaded) and compares it with the issued one. */
export default function VerifyPdf({ expectedSha256 }: { expectedSha256: string }) {
  const [result, setResult] = useState<"match" | "mismatch" | null>(null);

  const check = async (file: File | undefined) => {
    if (!file) return;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    setResult(hex === expectedSha256 ? "match" : "mismatch");
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs md:p-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="verify-pdf" className="text-base font-semibold text-foreground">
          Check a PDF copy
        </label>
        <p className="text-sm text-muted-foreground">
          Optional. Choose the PDF file you were given; it stays on your device. Only the original file GHMO issued matches: a
          scan, a printout or a copy saved again by another app won&apos;t, even when it looks the same.
        </p>
      </div>
      <input
        id="verify-pdf"
        type="file"
        accept="application/pdf"
        className="block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-card file:px-4 file:text-sm file:font-semibold file:text-foreground hover:file:bg-accent"
        onChange={event => void check(event.target.files?.[0])}
      />
      {result === "match" ? (
        <Alert variant="success" role="status">
          <FileCheck2 />
          <AlertDescription className="font-semibold text-foreground">This file is exactly the certificate that was issued.</AlertDescription>
        </Alert>
      ) : null}
      {result === "mismatch" ? (
        <Alert variant="destructive" role="status">
          <FileX2 />
          <AlertDescription className="font-semibold text-foreground">
            This file does not match the issued certificate file. That is expected for a scan or a re-saved copy. Check the
            certificate number above instead, or ask for the original PDF.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
