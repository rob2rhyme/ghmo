"use client";

import { useEffect, useState } from "react";
import DocBuilder from "./DocBuilder";
import type { DocTemplateMeta } from "../types";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { documentLoc } from "@/src/lib/documentRecords";

type SavedDocBuilderProps = {
  templatesMeta: DocTemplateMeta[];
  initialTemplateId?: string;
  initialInputs?: Record<string, string>;
  initialDocId?: string;
  initialTemplateVersion?: number;
  /** Encrypted inputs of the saved document, if it was saved with encryption on. */
  enc?: Record<string, unknown>;
};

/** Opens a saved document: decrypts its inputs on this device before showing the builder. */
export default function SavedDocBuilder({ enc, ...props }: SavedDocBuilderProps) {
  const { decrypt } = useE2ee();
  const [result, setResult] = useState<{ inputs?: Record<string, string>; error?: string } | null>(null);

  useEffect(() => {
    if (!enc || !props.initialDocId) return;
    let cancelled = false;
    decrypt<{ inputs?: Record<string, string> }>(enc, documentLoc(props.initialDocId))
      .then(data => {
        if (!cancelled) setResult({ inputs: data.inputs ?? {} });
      })
      .catch(error => {
        if (!cancelled) setResult({ error: error instanceof Error ? error.message : "Could not decrypt" });
      });
    return () => {
      cancelled = true;
    };
  }, [enc, props.initialDocId, decrypt]);

  if (!enc) return <DocBuilder {...props} />;
  if (!result) return <p className="text-sm text-muted-foreground">Decrypting document…</p>;
  if (result.error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-destructive">
        This document can&apos;t be decrypted on this device ({result.error}).
      </div>
    );
  }
  return <DocBuilder {...props} initialInputs={result.inputs} />;
}
