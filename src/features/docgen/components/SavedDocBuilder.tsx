"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Skeleton } from "@/src/components/ui/skeleton";
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
  initialExport?: "pdf" | "jpeg";
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
        if (!cancelled) setResult({ error: error instanceof Error ? error.message : "Could not unlock it" });
      });
    return () => {
      cancelled = true;
    };
  }, [enc, props.initialDocId, decrypt]);

  if (!enc) return <DocBuilder {...props} />;
  if (!result) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Unlocking document…</span>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (result.error) {
    return (
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>This document can&apos;t be opened on this device</AlertTitle>
        <AlertDescription>
          It is encrypted and this device couldn&apos;t unlock it ({result.error}). Ask a super admin for help.
        </AlertDescription>
      </Alert>
    );
  }
  return <DocBuilder {...props} initialInputs={result.inputs} />;
}
