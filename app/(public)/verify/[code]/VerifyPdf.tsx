"use client";

import { useState } from "react";

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
        <p className="text-sm text-muted-foreground">Choose the PDF you were given. It stays on your device; only its fingerprint is compared.</p>
      </div>
      <input
        id="verify-pdf"
        type="file"
        accept="application/pdf"
        className="block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-card file:px-4 file:text-sm file:font-semibold file:text-foreground hover:file:bg-accent"
        onChange={event => void check(event.target.files?.[0])}
      />
      {result === "match" ? (
        <p role="status" className="text-sm font-semibold text-success">
          This file is exactly the certificate that was issued.
        </p>
      ) : null}
      {result === "mismatch" ? (
        <p role="status" className="text-sm font-semibold text-destructive">
          This file does not match the issued certificate. It may have been altered, or it is a different copy.
        </p>
      ) : null}
    </div>
  );
}
