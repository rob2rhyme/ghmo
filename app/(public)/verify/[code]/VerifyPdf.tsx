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
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <label htmlFor="verify-pdf" className="text-sm font-semibold text-foreground">
        Check a PDF copy
      </label>
      <p className="mt-1 text-xs text-muted-foreground">Choose the PDF you were given. It stays on your device; only its fingerprint is compared.</p>
      <input id="verify-pdf" type="file" accept="application/pdf" className="mt-2 block text-sm" onChange={event => void check(event.target.files?.[0])} />
      {result === "match" ? (
        <p role="status" className="mt-3 text-sm font-semibold text-success">
          This file is exactly the certificate that was issued.
        </p>
      ) : null}
      {result === "mismatch" ? (
        <p role="status" className="mt-3 text-sm font-semibold text-destructive">
          This file does not match the issued certificate. It may have been altered, or it is a different copy.
        </p>
      ) : null}
    </div>
  );
}
