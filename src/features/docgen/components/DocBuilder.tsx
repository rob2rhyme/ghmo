"use client";

import { jsPDF } from "jspdf";
import * as htmlToImage from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import DocForm from "./DocForm";
import DocPreview from "./DocPreview";
import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "./LetterheadPage";
import TemplateTabs from "./TemplateTabs";
import LocalQrCode from "@/src/components/LocalQrCode";
import { DocField, DocTemplateMeta, DocTemplateStep } from "../types";
import { getTemplateById } from "../templates";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { documentLoc, newDocumentId } from "@/src/lib/documentRecords";

async function toJpegDataUrl(pngUrl: string, quality = 0.82) {
  const image = new Image();
  image.src = pngUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

function pngDataUrl(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

type DocBuilderProps = {
  templatesMeta: DocTemplateMeta[];
  initialTemplateId?: string;
  initialInputs?: Record<string, string>;
  initialDocId?: string;
};

type ExportFormat = "pdf" | "jpeg";
type SignatureRole = "witness1" | "witness2" | "officiant" | "issuingAuthority";

type SignatureSession = {
  role: SignatureRole;
  sessionId: string;
  status: "pending" | "signed" | "expired" | "finalized" | "cancelled";
  signUrl: string;
  expiresAt?: string;
};

const PIXEL_RATIO = 2;
const SIGNATURE_ROLES: Array<{ role: SignatureRole; label: string; inputKey: string }> = [
  { role: "witness1", label: "Witness 1", inputKey: "witness1SignatureImage" },
  { role: "witness2", label: "Witness 2", inputKey: "witness2SignatureImage" },
  { role: "officiant", label: "Officiant", inputKey: "officiantSignatureImage" },
  { role: "issuingAuthority", label: "Issuing Authority", inputKey: "issuingAuthoritySignatureImage" }
];
const SIGNATURE_FIELDS: Record<SignatureRole, string> = {
  witness1: "witness1Signature",
  witness2: "witness2Signature",
  officiant: "officiantSignature",
  issuingAuthority: "officialSeal"
};
const SIGNATURE_IMAGE_BY_ROLE: Record<SignatureRole, string> = {
  witness1: "witness1SignatureImage",
  witness2: "witness2SignatureImage",
  officiant: "officiantSignatureImage",
  issuingAuthority: "issuingAuthoritySignatureImage"
};
const SIGNATURE_IMAGE_KEYS = new Set(
  SIGNATURE_ROLES.map(role => role.inputKey)
);
const LOCKED_FIELD_VALUES: Record<string, string> = {
  organizationName: "Greater Harrisburg Magar Organization"
};
const LOCKED_FIELD_IDS = new Set([...Object.keys(LOCKED_FIELD_VALUES), "officialSeal"]);
const FALLBACK_STEP_TITLES = [
  "Document Details",
  "Recipient/Parties",
  "Event/Main Content",
  "Additional Details"
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildTemplateSteps = (meta?: DocTemplateMeta): DocTemplateStep[] => {
  if (!meta) return [];
  const fieldIds = meta.fields
    .map(field => field.id)
    .filter(id => !LOCKED_FIELD_IDS.has(id));
  if (meta.steps && meta.steps.length > 0) {
    const cleaned = meta.steps
      .map(step => ({
        ...step,
        fieldKeys: step.fieldKeys.filter(key => fieldIds.includes(key))
      }))
      .filter(step => step.fieldKeys.length > 0);
    const covered = new Set(cleaned.flatMap(step => step.fieldKeys));
    const missing = fieldIds.filter(id => !covered.has(id));
    if (missing.length > 0) {
      if (cleaned.length > 0) {
        const last = cleaned[cleaned.length - 1];
        cleaned[cleaned.length - 1] = {
          ...last,
          fieldKeys: [...last.fieldKeys, ...missing]
        };
      } else {
        cleaned.push({
          id: "additional-details",
          title: "Additional Details",
          fieldKeys: missing
        });
      }
    }
    return cleaned;
  }

  const groupCount = fieldIds.length <= 6 ? 2 : fieldIds.length <= 12 ? 3 : 4;
  const titles = FALLBACK_STEP_TITLES.slice(0, groupCount);
  const size = Math.ceil(fieldIds.length / groupCount);
  return titles.map((title, index) => ({
    id: slugify(title) || `step-${index + 1}`,
    title,
    fieldKeys: fieldIds.slice(index * size, (index + 1) * size)
  }));
};

const mapFieldsById = (fields: DocField[]) =>
  fields.reduce<Map<string, DocField>>((acc, field) => {
    acc.set(field.id, field);
    return acc;
  }, new Map());

export default function DocBuilder({
  templatesMeta,
  initialTemplateId,
  initialInputs,
  initialDocId
}: DocBuilderProps) {
  const { openSealedSignature, packPrivate, enabled: encrypted } = useE2ee();
  const defaultTemplateId = initialTemplateId ?? templatesMeta[0]?.id ?? "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateId);
  const [inputsByTemplate, setInputsByTemplate] = useState<Record<string, Record<string, string>>>(() => {
    if (!initialInputs) return {};
    if (!defaultTemplateId) return {};
    return { [defaultTemplateId]: initialInputs };
  });
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [letterheadReady, setLetterheadReady] = useState(false);
  const [signatureSessions, setSignatureSessions] = useState<Record<SignatureRole, SignatureSession | undefined>>({
    witness1: undefined,
    witness2: undefined,
    officiant: undefined,
    issuingAuthority: undefined
  });
  const [activeQrRole, setActiveQrRole] = useState<SignatureRole | null>(null);

  const selectedTemplateMeta = useMemo(
    () => templatesMeta.find(meta => meta.id === selectedTemplateId),
    [selectedTemplateId, templatesMeta]
  );
  const selectedTemplate = useMemo(() => getTemplateById(selectedTemplateId), [selectedTemplateId]);
  const currentInputs = inputsByTemplate[selectedTemplateId] ?? {};
  const mergedInputs = useMemo(
    () => ({
      ...currentInputs,
      ...LOCKED_FIELD_VALUES
    }),
    [currentInputs]
  );
  const stepDefinitions = useMemo(
    () => buildTemplateSteps(selectedTemplateMeta),
    [selectedTemplateMeta]
  );
  const steps = useMemo(
    () => [
      ...stepDefinitions,
      { id: "review-print", title: "Review & Print", fieldKeys: [] }
    ],
    [stepDefinitions]
  );
  const isReviewStep = activeStepIndex >= steps.length - 1;
  const activeStep = steps[activeStepIndex];
  const stepFields = useMemo(() => {
    if (!selectedTemplateMeta || !activeStep || isReviewStep) return [];
    const fieldMap = mapFieldsById(selectedTemplateMeta.fields);
    return activeStep.fieldKeys
      .map(key => fieldMap.get(key))
      .filter((field): field is DocField => Boolean(field));
  }, [activeStep, isReviewStep, selectedTemplateMeta]);

  useEffect(() => {
    setActiveStepIndex(index => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  const handleFieldChange = (fieldId: string, value: string) => {
    setInputsByTemplate(prev => ({
      ...prev,
      [selectedTemplateId]: {
        ...(prev[selectedTemplateId] ?? {}),
        [fieldId]: value
      }
    }));
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setActiveStepIndex(0);
  };

  useEffect(() => {
    setSignatureSessions({
      witness1: undefined,
      witness2: undefined,
      officiant: undefined,
      issuingAuthority: undefined
    });
    setActiveQrRole(null);
    setActiveStepIndex(0);
    setLetterheadReady(false);
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!isReviewStep) {
      setLetterheadReady(false);
    }
  }, [isReviewStep]);

  useEffect(() => {
    const pendingSessions = Object.values(signatureSessions).filter(
      session => session && session.status === "pending"
    ) as SignatureSession[];
    if (pendingSessions.length === 0) return undefined;

    let cancelled = false;
    const poll = async () => {
      await Promise.all(
        pendingSessions.map(async session => {
          try {
            const response = await fetch(`/api/admin/signing-sessions/${session.sessionId}`);
            if (!response.ok) return;
            const payload = await response.json();
            if (cancelled) return;
            setSignatureSessions(prev => ({
              ...prev,
              [session.role]: {
                ...session,
                status: payload.status ?? session.status,
                expiresAt: payload.expiresAt ?? session.expiresAt
              }
            }));
            if (payload.status === "signed" && !currentInputs[SIGNATURE_IMAGE_BY_ROLE[session.role]]) {
              const signedResponse = await fetch(
                `/api/admin/signing-sessions/${session.sessionId}?includeSignature=1`
              );
              if (!signedResponse.ok) return;
              const signedPayload = await signedResponse.json();
              let signatureDataUrl = signedPayload.signatureDataUrl as string | undefined;
              if (!signatureDataUrl && signedPayload.signatureSealed) {
                // Sealed by the signer: only an unlocked admin device can open it.
                const bytes = await openSealedSignature(signedPayload.signatureSealed, session.sessionId);
                signatureDataUrl = pngDataUrl(bytes);
              }
              if (signatureDataUrl) {
                handleFieldChange(SIGNATURE_IMAGE_BY_ROLE[session.role], signatureDataUrl);
              }
            }
          } catch (error) {
            console.error("Failed to poll signing session", error);
          }
        })
      );
    };

    const interval = window.setInterval(poll, 2000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [signatureSessions, currentInputs, openSealedSignature]);

  const handleExport = async (format: ExportFormat) => {
    if (!previewRef.current || !selectedTemplate || !selectedTemplateMeta || !letterheadReady) return;
    setStatusMessage("Generating preview...");
    setIsExporting(true);
    try {
      const exportWidth = LETTER_WIDTH_PX * PIXEL_RATIO;
      const exportHeight = LETTER_HEIGHT_PX * PIXEL_RATIO;
      const dataUrl = await htmlToImage.toPng(previewRef.current, {
        width: exportWidth,
        height: exportHeight,
        pixelRatio: PIXEL_RATIO,
        backgroundColor: "#ffffff"
      });

      if (format === "jpeg") {
        downloadDataUrl(dataUrl, `${selectedTemplateMeta?.title.replace(/\s+/g, "-") ?? "document"}.jpg`);
        setStatusMessage("JPEG ready to download");
      } else {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.addImage(dataUrl, "PNG", 0, 0, pageWidth, pageHeight);
        doc.save(`${selectedTemplateMeta?.title.replace(/\s+/g, "-") ?? "document"}.pdf`);
        setStatusMessage("PDF downloaded");
      }
    } catch (error) {
      console.error("Document export failed", error);
      setStatusMessage("Failed to export document");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate || !selectedTemplateMeta) {
      setStatusMessage("Template data unavailable");
      return;
    }
    setStatusMessage("Saving to gallery...");
    setIsSaving(true);
    try {
      const sanitizedInputs = Object.keys(currentInputs).reduce<Record<string, string>>((acc, key) => {
        if (!SIGNATURE_IMAGE_KEYS.has(key)) {
          acc[key] = currentInputs[key];
        }
        return acc;
      }, {});
      const lockedInputs = { ...sanitizedInputs, ...LOCKED_FIELD_VALUES };
      const savedId = initialDocId ?? newDocumentId();
      // With encryption on this is {enc}; before that it is {inputs}, as always.
      const privateFields = await packPrivate(documentLoc(savedId), { inputs: lockedInputs });
      const response = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateMeta.id,
          templateTitle: selectedTemplateMeta.title,
          category: selectedTemplateMeta.category,
          ...privateFields,
          docId: savedId
        })
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload?.error ??
            errorPayload?.message ??
            `Unexpected response (${response.status})`
        );
      }
      const payload = await response.json();
      setStatusMessage("Document saved to gallery");
      if (payload?.id) {
        setStatusMessage(`Document saved (ID: ${payload.id})`);
      }
    } catch (error) {
      console.error("Failed to save document", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to save document");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestSignature = async (role: SignatureRole) => {
    if (!selectedTemplateMeta) return;
    setStatusMessage("Creating signing session...");
    try {
      const certificateId =
        currentInputs.certificateNumber || currentInputs.certificateId || selectedTemplateMeta.id;
      const response = await fetch("/api/admin/signing-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, certificateId })
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error ?? `Unexpected response (${response.status})`);
      }
      const payload = await response.json();
      const session: SignatureSession = {
        role,
        sessionId: payload.sessionId,
        status: "pending",
        signUrl: payload.signUrl,
        expiresAt: payload.expiresAt
      };
      setSignatureSessions(prev => ({ ...prev, [role]: session }));
      handleFieldChange(SIGNATURE_IMAGE_BY_ROLE[role], "");
      setActiveQrRole(role);
      setStatusMessage("Signature session created");
    } catch (error) {
      console.error("Failed to create signing session", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to create signing session");
    }
  };

  const handleFinalizeSigned = async () => {
    if (!previewRef.current || !selectedTemplateMeta || !letterheadReady) return;
    const signedSessions = Object.values(signatureSessions).filter(
      session => session && session.status === "signed"
    ) as SignatureSession[];
    if (signedSessions.length === 0) {
      setStatusMessage("No signed sessions to finalize yet");
      return;
    }
    setIsFinalizing(true);
    setStatusMessage("Finalizing signed certificate...");
    try {
      const exportWidth = LETTER_WIDTH_PX * PIXEL_RATIO;
      const exportHeight = LETTER_HEIGHT_PX * PIXEL_RATIO;
      const dataUrl = await htmlToImage.toPng(previewRef.current, {
        width: exportWidth,
        height: exportHeight,
        pixelRatio: PIXEL_RATIO,
        backgroundColor: "#ffffff"
      });
      const signatureMap = signedSessions.reduce<Record<string, string>>((acc, session) => {
        acc[session.role] = session.sessionId;
        return acc;
      }, {});
      const sanitizedInputs = Object.keys(currentInputs).reduce<Record<string, string>>((acc, key) => {
        if (!SIGNATURE_IMAGE_KEYS.has(key)) {
          acc[key] = currentInputs[key];
        }
        return acc;
      }, {});
      const lockedInputs = { ...sanitizedInputs, ...LOCKED_FIELD_VALUES };
      let sealedCertificate: Record<string, unknown>;
      if (encrypted) {
        // The PDF is built and encrypted here, so the server never sees the signed certificate.
        // JPEG keeps the encrypted PDF under the 1 MiB document limit.
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
        pdf.addImage(await toJpegDataUrl(dataUrl), "JPEG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
        const pdfBase64 = pdf.output("datauristring").split(",")[1];
        const docId = newDocumentId();
        sealedCertificate = { docId, ...(await packPrivate(documentLoc(docId), { inputs: lockedInputs, pdfBase64 })) };
      } else {
        sealedCertificate = { inputs: lockedInputs, pngDataUrl: dataUrl };
      }
      const response = await fetch(
        `/api/admin/signing-sessions/${signedSessions[0].sessionId}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            certificatePayload: {
              templateId: selectedTemplateMeta.id,
              templateTitle: selectedTemplateMeta.title,
              category: selectedTemplateMeta.category,
              certificateId: currentInputs.certificateNumber || "",
              ...sealedCertificate
            },
            signatures: signatureMap
          })
        }
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error ?? `Unexpected response (${response.status})`);
      }
      const payload = await response.json();
      setStatusMessage(payload?.documentId ? `Signed PDF saved (ID: ${payload.documentId})` : "Signed PDF saved");
      setSignatureSessions({
        witness1: undefined,
        witness2: undefined,
        officiant: undefined,
        issuingAuthority: undefined
      });
      SIGNATURE_ROLES.forEach(({ role }) => handleFieldChange(SIGNATURE_IMAGE_BY_ROLE[role], ""));
      setActiveQrRole(null);
    } catch (error) {
      console.error("Failed to finalize signed certificate", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to finalize signed certificate");
    } finally {
      setIsFinalizing(false);
    }
  };

  const statusColor = statusMessage?.toLowerCase().includes("failed") ? "text-destructive" : "text-muted-foreground";
  const signatureEnabled = selectedTemplateId === "wedding-certificate";
  const activeSession = activeQrRole ? signatureSessions[activeQrRole] : undefined;
  const signatureActions = signatureEnabled
    ? SIGNATURE_ROLES.reduce<Record<string, { label: string; onClick: () => void; status?: string; badge?: string; disabled?: boolean }>>(
        (acc, roleConfig) => {
          const session = signatureSessions[roleConfig.role];
          const status = session?.status;
          let statusLabel = "No session";
          if (status === "pending") statusLabel = "Pending";
          if (status === "signed") statusLabel = "Signed";
          if (status === "expired") statusLabel = "Expired";
          if (status === "cancelled") statusLabel = "Cancelled";
          const hasImage = Boolean(currentInputs[SIGNATURE_IMAGE_BY_ROLE[roleConfig.role]]);
          acc[SIGNATURE_FIELDS[roleConfig.role]] = {
            label: status === "signed" || hasImage ? "Re-request" : "Request",
            onClick: () => handleRequestSignature(roleConfig.role),
            status: statusLabel,
            badge: status === "signed" || hasImage ? "Signed ✓" : undefined
          };
          return acc;
        },
        {}
      )
    : undefined;

  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Document generator</p>
            <h1 className="text-2xl font-semibold text-foreground">Document builder</h1>
            {initialDocId ? (
              <p className="text-xs text-slate-400">Editing saved document ({initialDocId})</p>
            ) : null}
          </div>
        </div>
        <div className="hidden lg:block">
          <TemplateTabs tabs={templatesMeta} activeTabId={selectedTemplateId} onTabChange={handleTemplateChange} />
        </div>
        <div className="block lg:hidden">
          <TemplateTabs tabs={templatesMeta} activeTabId={selectedTemplateId} onTabChange={handleTemplateChange} />
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {steps.map((step, index) => {
              const active = index === activeStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepIndex(index)}
                  className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground/80"
                  }`}
                >
                  {step.title}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Step {Math.min(activeStepIndex + 1, steps.length)} of {steps.length}
            </p>
            <p className="uppercase tracking-wide">{activeStep?.title}</p>
          </div>
        </div>
        {selectedTemplateMeta ? (
          <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{selectedTemplateMeta.category}</p>
              <p className="text-sm text-muted-foreground">{selectedTemplateMeta.description}</p>
            </div>
            {!isReviewStep ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{activeStep?.title}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {stepFields.length} fields
                    </p>
                  </div>
                  <DocForm fields={stepFields} values={mergedInputs} onChange={handleFieldChange} />
                </div>
                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex(index => Math.max(0, index - 1))}
                    disabled={activeStepIndex === 0}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-input disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex(index => Math.min(steps.length - 1, index + 1))}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Letter preview</p>
                  {selectedTemplate ? (
                    <DocPreview
                      template={selectedTemplate}
                      inputs={mergedInputs}
                      ref={previewRef}
                      onBackgroundLoad={() => setLetterheadReady(true)}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-white/70 p-6 text-center text-xs text-slate-400">
                      Add a template to see a preview here.
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    Preview is letter-size (8.5x11) and used for export.
                  </p>
                </div>
                {signatureEnabled ? (
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Signature requests</p>
                      <p className="text-[0.65rem] uppercase tracking-wide text-slate-400">
                        Request links for mobile signing
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SIGNATURE_ROLES.map(roleConfig => {
                        const action = signatureActions?.[SIGNATURE_FIELDS[roleConfig.role]];
                        if (!action) return null;
                        return (
                          <div
                            key={roleConfig.role}
                            className="rounded-xl border border-border bg-background/70 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground/80">{roleConfig.label}</p>
                              {action.badge ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-700">
                                  {action.badge}
                                </span>
                              ) : null}
                            </div>
                            {action.status ? <p className="text-xs text-slate-400">{action.status}</p> : null}
                            <button
                              type="button"
                              onClick={action.onClick}
                              disabled={action.disabled}
                              className="mt-3 w-full rounded-full border border-border px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {action.label}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-start">
                  <button
                    type="button"
                    onClick={() => handleExport("pdf")}
                    disabled={!selectedTemplate || isExporting || !letterheadReady}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
                  >
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("jpeg")}
                    disabled={!selectedTemplate || isExporting || !letterheadReady}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/80 transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
                  >
                    Download JPEG
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!selectedTemplate || isSaving}
                    className="rounded-full border border-emerald-400 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
                  >
                    Save to Gallery
                  </button>
                  {signatureEnabled ? (
                    <button
                      type="button"
                      onClick={handleFinalizeSigned}
                      disabled={!selectedTemplate || isFinalizing || !letterheadReady}
                      className="rounded-full border border-border bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
                    >
                      Finalize & Save Signed Certificate
                    </button>
                  ) : null}
                </div>
                {statusMessage ? <p className={`text-xs ${statusColor}`}>{statusMessage}</p> : null}
                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex(index => Math.max(0, index - 1))}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-input"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No template selected.</p>
        )}
      </div>
      {activeSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Signature link</p>
                <p className="text-lg font-semibold text-foreground">
                  {SIGNATURE_ROLES.find(role => role.role === activeSession.role)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveQrRole(null)}
                className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background/60 p-4 text-center">
              <LocalQrCode
                value={activeSession.signUrl}
                alt="QR code for signing link"
                className="h-48 w-48 rounded-lg border border-border bg-card p-2"
              />
              <p className="text-xs text-muted-foreground">Scan on phone to sign</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Direct link</p>
              <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                {activeSession.signUrl}
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeSession.signUrl);
                    setStatusMessage("Signing link copied");
                  } catch (error) {
                    console.error("Failed to copy link", error);
                    setStatusMessage("Unable to copy link");
                  }
                }}
                className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:border-primary"
              >
                Copy link
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
