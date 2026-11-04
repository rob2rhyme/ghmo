"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Copy, Download, Eye, EyeOff, FileCheck2, FileText, Image as ImageIcon, Save, TriangleAlert } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { ProgressBar } from "@/src/components/ui/stat";
import { Steps } from "@/src/components/ui/steps";
import { cn } from "@/src/lib/utils";
import DocForm from "./DocForm";
import DocPreview, { hintValue, type DocPreviewHandle } from "./DocPreview";
import TemplateTabs from "./TemplateTabs";
import { buildLetterPdf, capturePages, downloadDataUrl, fitPagesAsJpeg, stackPagesAsJpeg } from "../export/letterExport";
import { cleanSignatureDataUrl } from "../signatureInk";
import LocalQrCode from "@/src/components/LocalQrCode";
import { DocField, DocTemplateMeta, DocTemplateStep } from "../types";
import { getTemplateById } from "../templates";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { documentLoc, newDocumentId } from "@/src/lib/documentRecords";

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
  /** Template version the saved document was made with. */
  initialTemplateVersion?: number;
  /** Opened from a gallery "Download …" link: start on the last step and download once the page is ready. */
  initialExport?: "pdf" | "jpeg";
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

/**
 * Size budgets for the issued PDF. Encrypted, it travels base64 inside JSON inside an envelope of at most 900,000
 * characters; otherwise the server stores it base64 in a 1 MiB document.
 */
const MAX_ENCRYPTED_PDF_BYTES = 470_000;
const MAX_PLAIN_PDF_BYTES = 700_000;
/** Signature status polling: start at 2 s and back off to 5 s between rounds. */
const POLL_START_MS = 2000;
const POLL_MAX_MS = 5000;
const SIGNATURE_ROLES: Array<{ role: SignatureRole; label: string; inputKey: string }> = [
  { role: "witness1", label: "Witness 1", inputKey: "witness1SignatureImage" },
  { role: "witness2", label: "Witness 2", inputKey: "witness2SignatureImage" },
  { role: "officiant", label: "Officiant", inputKey: "officiantSignatureImage" },
  { role: "issuingAuthority", label: "Issuer", inputKey: "issuingAuthoritySignatureImage" }
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
// Inputs that exist only while a certificate is being issued; they are never saved with a document.
const VERIFICATION_KEYS = ["verificationCode", "verificationQrImage", "verificationUrl"];
const VERIFICATION_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const newVerificationCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => VERIFICATION_ALPHABET[byte % 32]).join("");

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

function downloadBytes(fileName: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const SIGNATURE_IMAGE_KEYS = new Set([...SIGNATURE_ROLES.map(role => role.inputKey), ...VERIFICATION_KEYS]);
const LOCKED_FIELD_VALUES: Record<string, string> = {
  organizationName: "Greater Harrisburg Magar Organization"
};
const LOCKED_FIELD_IDS = new Set([...Object.keys(LOCKED_FIELD_VALUES), "officialSeal"]);
const FALLBACK_STEP_TITLES = ["Details", "Recipient", "Event", "More details"];

/** A message for a failed API call: the server's own words for a refusal, never for a server fault (5xx). */
async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status >= 500) return fallback;
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
  const text = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
  return text || fallback;
}

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
          title: "More details",
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
  initialDocId,
  initialTemplateVersion,
  initialExport
}: DocBuilderProps) {
  const { openSealedSignature, packPrivate, enabled: encrypted } = useE2ee();
  const defaultTemplateId = initialTemplateId ?? templatesMeta[0]?.id ?? "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateId);
  const [inputsByTemplate, setInputsByTemplate] = useState<Record<string, Record<string, string>>>(() => {
    if (!initialInputs) return {};
    if (!defaultTemplateId) return {};
    return { [defaultTemplateId]: initialInputs };
  });
  // A gallery download link opens the last step (the review), where the page that is downloaded is drawn.
  const [activeStepIndex, setActiveStepIndex] = useState(() =>
    initialExport ? buildTemplateSteps(templatesMeta.find(meta => meta.id === defaultTemplateId)).length : 0
  );
  const pendingExport = useRef<ExportFormat | undefined>(initialExport);
  const shownTemplateId = useRef(selectedTemplateId);
  const [previewOpen, setPreviewOpen] = useState(false);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const previewRef = useRef<DocPreviewHandle | null>(null);
  const [letterheadReady, setLetterheadReady] = useState(false);
  const [reviewPageCount, setReviewPageCount] = useState(1);
  const [isNumbering, setIsNumbering] = useState(false);
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
  /** Live preview only: empty text fields show as gray "[label]" hints (the exported copy, from mergedInputs, leaves their sentence out). */
  const hintedInputs = useMemo(() => {
    if (!selectedTemplateMeta || selectedTemplateMeta.id === "wedding-certificate") return mergedInputs;
    const hinted: Record<string, string> = { ...mergedInputs };
    for (const field of selectedTemplateMeta.fields) {
      if (LOCKED_FIELD_IDS.has(field.id) || !["text", "textarea", "date"].includes(field.type)) continue;
      if (!hinted[field.id]?.trim()) hinted[field.id] = hintValue(field.label);
    }
    return hinted;
  }, [mergedInputs, selectedTemplateMeta]);
  const stepDefinitions = useMemo(
    () => buildTemplateSteps(selectedTemplateMeta),
    [selectedTemplateMeta]
  );
  const steps = useMemo(
    () => [
      ...stepDefinitions,
      { id: "review-print", title: "Review", fieldKeys: [] }
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

  const signatureTemplate = selectedTemplateId === "wedding-certificate";
  const hasVerificationCode = Boolean(currentInputs.verificationCode);
  useEffect(() => {
    // Each certificate gets its own verification code; its QR code is printed on the certificate.
    if (!signatureTemplate || hasVerificationCode) return;
    let cancelled = false;
    const code = newVerificationCode();
    const url = `${window.location.origin}/verify/${code}`;
    // The QR library is loaded only for certificates, which are the only template that prints one.
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 160, margin: 1, errorCorrectionLevel: "M" }))
      .then(image => {
        if (cancelled) return;
        setInputsByTemplate(prev => ({
          ...prev,
          "wedding-certificate": { ...(prev["wedding-certificate"] ?? {}), verificationCode: code, verificationUrl: url, verificationQrImage: image }
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [signatureTemplate, hasVerificationCode]);

  /**
   * Same value when requesting signatures and when issuing, so signatures can be matched to the certificate. Never
   * the template's id: a certificate without a number gets one from the server first (ensureCertificateNumber).
   */
  const signingCertificateId = () => (currentInputs.certificateNumber || currentInputs.certificateId || "").trim();

  /** The typed certificate number, or the next automatic one ("GHMO-2026-001"), which is then filled in. */
  const ensureCertificateNumber = async (): Promise<string> => {
    const existing = signingCertificateId();
    if (existing) return existing;
    setIsNumbering(true);
    try {
      const response = await fetch("/api/admin/certificates/number", { method: "POST" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "A certificate number couldn't be assigned. Try again."));
      const payload = (await response.json()) as { certificateNumber?: unknown };
      if (typeof payload.certificateNumber !== "string" || !payload.certificateNumber) {
        throw new Error("A certificate number couldn't be assigned. Try again.");
      }
      handleFieldChange("certificateNumber", payload.certificateNumber);
      return payload.certificateNumber;
    } finally {
      setIsNumbering(false);
    }
  };

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
    // Only when the template really changes (not on first render, which already starts clean).
    if (shownTemplateId.current === selectedTemplateId) return;
    shownTemplateId.current = selectedTemplateId;
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

  // Signature polling: one timer for every pending signer, keyed on the pending session ids (so typing in
  // the form does not restart it), backing off from 2 s to 5 s and paused while the tab is hidden.
  const pendingSessionKey = Object.values(signatureSessions)
    .filter((session): session is SignatureSession => Boolean(session && session.status === "pending"))
    .map(session => `${session.role}:${session.sessionId}`)
    .join(",");
  const pollDeps = useRef({ signatureSessions, currentInputs, handleFieldChange, openSealedSignature });
  useEffect(() => {
    pollDeps.current = { signatureSessions, currentInputs, handleFieldChange, openSealedSignature };
  });
  useEffect(() => {
    if (!pendingSessionKey) return undefined;

    let cancelled = false;
    let timer: number | undefined;
    let delay = POLL_START_MS;
    const poll = async () => {
      const deps = pollDeps.current;
      const pendingSessions = Object.values(deps.signatureSessions).filter(
        (session): session is SignatureSession => Boolean(session && session.status === "pending")
      );
      await Promise.all(
        pendingSessions.map(async session => {
          try {
            const response = await fetch(`/api/admin/signing-sessions/${session.sessionId}`);
            if (!response.ok) return;
            const payload = await response.json();
            if (cancelled) return;
            const nextStatus: SignatureSession["status"] = payload.status ?? session.status;
            const nextExpiresAt: string | undefined = payload.expiresAt ?? session.expiresAt;
            if (nextStatus !== session.status || nextExpiresAt !== session.expiresAt) {
              setSignatureSessions(prev => {
                const current = prev[session.role];
                if (!current || current.sessionId !== session.sessionId) return prev;
                return { ...prev, [session.role]: { ...current, status: nextStatus, expiresAt: nextExpiresAt } };
              });
            }
            if (payload.status === "signed" && !deps.currentInputs[SIGNATURE_IMAGE_BY_ROLE[session.role]]) {
              const signedResponse = await fetch(
                `/api/admin/signing-sessions/${session.sessionId}?includeSignature=1`
              );
              if (!signedResponse.ok) return;
              const signedPayload = await signedResponse.json();
              let signatureDataUrl = signedPayload.signatureDataUrl as string | undefined;
              if (!signatureDataUrl && signedPayload.signatureSealed) {
                // Sealed by the signer: only an unlocked admin device can open it.
                const bytes = await deps.openSealedSignature(signedPayload.signatureSealed, session.sessionId);
                signatureDataUrl = pngDataUrl(bytes);
              }
              if (signatureDataUrl) {
                // Dark ink on transparent, trimmed (signatures from the old pad were light ink on navy).
                deps.handleFieldChange(SIGNATURE_IMAGE_BY_ROLE[session.role], await cleanSignatureDataUrl(signatureDataUrl));
              }
            }
          } catch (error) {
            console.error("Failed to poll signing session", error);
          }
        })
      );
    };
    const tick = async () => {
      if (cancelled || document.hidden) return; // a hidden tab resumes on visibilitychange
      await poll();
      if (cancelled) return;
      delay = Math.min(Math.round(delay * 1.5), POLL_MAX_MS);
      timer = window.setTimeout(tick, delay);
    };
    const onVisibilityChange = () => {
      if (cancelled || document.hidden) return;
      window.clearTimeout(timer);
      delay = POLL_START_MS;
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pendingSessionKey]);

  const handleExport = async (format: ExportFormat) => {
    if (!letterheadReady) return;
    await exportPage(format);
  };

  /** Draws every page of the review-step preview (call only once the letterhead has loaded). */
  const capturePreviewPages = async () => {
    const preview = previewRef.current;
    if (!preview) throw new Error("The preview isn't ready yet. Try again in a moment.");
    await preview.settle();
    return capturePages(preview.pages());
  };

  /**
   * Downloads the review-step pages. A PDF has one page per page; the image (JPEG) has every page, one under
   * another, so nothing is left out of either.
   */
  const exportPage = async (format: ExportFormat) => {
    if (!previewRef.current || !selectedTemplate || !selectedTemplateMeta) return;
    setIsExporting(true);
    try {
      const images = await capturePreviewPages();
      const baseName = selectedTemplateMeta.title.replace(/\s+/g, "-") || "document";
      const pages = images.length === 1 ? "" : ` (${images.length} pages)`;
      if (format === "jpeg") {
        downloadDataUrl(await stackPagesAsJpeg(images), `${baseName}.jpg`);
        toast.success(images.length === 1 ? "Image (JPEG) downloaded" : `Image (JPEG) downloaded: ${images.length} pages, one under another`);
      } else {
        (await buildLetterPdf(images, "PNG")).save(`${baseName}.pdf`);
        toast.success(`PDF downloaded${pages}`);
      }
    } catch (error) {
      console.error("Document export failed", error);
      toast.error("Couldn't make the download. Try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate || !selectedTemplateMeta) {
      toast.error("This template couldn't be loaded. Reload the page and try again.");
      return;
    }
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
          templateVersion: selectedTemplateMeta.version,
          ...privateFields,
          docId: savedId
        })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Couldn't save the document. Try again."));
      }
      await response.json().catch(() => null);
      toast.success("Saved to the document gallery", {
        action: { label: "Open document gallery", onClick: () => router.push("/admin/document-gallery") }
      });
    } catch (error) {
      console.error("Failed to save document", error);
      toast.error(error instanceof Error ? error.message : "Couldn't save the document. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestSignature = async (role: SignatureRole) => {
    if (!selectedTemplateMeta) return;
    try {
      // Every signature is collected for a numbered certificate.
      const certificateId = await ensureCertificateNumber();
      const response = await fetch("/api/admin/signing-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The template's name, so the signer's page can say what they are signing.
        body: JSON.stringify({ role, certificateId, documentTitle: selectedTemplateMeta.title })
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Couldn't make a signature link. Try again."));
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
    } catch (error) {
      console.error("Failed to create signing session", error);
      toast.error(error instanceof Error ? error.message : "Couldn't make a signature link. Try again.");
    }
  };

  const handleFinalizeSigned = async () => {
    if (!previewRef.current || !selectedTemplateMeta || !letterheadReady) return;
    const certificateId = signingCertificateId();
    if (!certificateId) {
      toast.error("This certificate has no number yet. Request a signature first; that assigns one.");
      return;
    }
    const signedSessions = Object.values(signatureSessions).filter(
      session => session && session.status === "signed"
    ) as SignatureSession[];
    if (signedSessions.length === 0) {
      toast.error("Nobody has signed yet. Request a signature first.");
      return;
    }
    setIsFinalizing(true);
    try {
      // Every page is issued: the stored PDF, its hash and the download all cover the whole certificate.
      const pngPages = await capturePreviewPages();
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
      let signedPdf: Uint8Array<ArrayBuffer> | undefined;
      if (encrypted) {
        // The PDF is built and encrypted here, so the server never sees the signed certificate.
        // JPEG pages keep the encrypted PDF under the 1 MiB document limit.
        const { pdfBytes } = await fitPagesAsJpeg(pngPages, MAX_ENCRYPTED_PDF_BYTES);
        const docId = newDocumentId();
        signedPdf = pdfBytes;
        sealedCertificate = {
          docId,
          pdfSha256: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes)), b => b.toString(16).padStart(2, "0")).join(""),
          ...(await packPrivate(documentLoc(docId), { inputs: lockedInputs, pdfBase64: bytesToBase64(pdfBytes) }))
        };
      } else {
        // The server builds the PDF from these page images (one PDF page each) and hashes what it built.
        const { jpegs } = await fitPagesAsJpeg(pngPages, MAX_PLAIN_PDF_BYTES);
        sealedCertificate = { inputs: lockedInputs, pageImages: jpegs };
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
              templateVersion: selectedTemplateMeta.version,
              certificateId,
              verificationCode: currentInputs.verificationCode,
              ...sealedCertificate
            },
            signatures: signatureMap
          })
        }
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Couldn't save the signed certificate. Try again."));
      }
      const payload = await response.json();
      // The issued PDF is what the verification page checks, so hand it over now.
      const issued = signedPdf ?? (payload?.pdfBase64 ? Uint8Array.from(atob(payload.pdfBase64), c => c.charCodeAt(0)) : undefined);
      if (issued) downloadBytes(`${slugify(certificateId) || "certificate"}.pdf`, issued as Uint8Array<ArrayBuffer>);
      VERIFICATION_KEYS.forEach(key => handleFieldChange(key, ""));
      toast.success("Signed PDF saved to the document gallery and downloaded");
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
      toast.error(error instanceof Error ? error.message : "Couldn't save the signed certificate. Try again.");
    } finally {
      setIsFinalizing(false);
    }
  };

  const signatureEnabled = selectedTemplateId === "wedding-certificate";
  const activeSession = activeQrRole ? signatureSessions[activeQrRole] : undefined;
  const signatureActions = signatureEnabled
    ? SIGNATURE_ROLES.reduce<Record<string, { label: string; onClick: () => void; status?: string; badge?: string; disabled?: boolean }>>(
        (acc, roleConfig) => {
          const session = signatureSessions[roleConfig.role];
          const status = session?.status;
          let statusLabel = "Not requested yet";
          if (status === "pending") statusLabel = "Pending";
          if (status === "signed") statusLabel = "Signed";
          if (status === "expired") statusLabel = "Expired";
          if (status === "cancelled") statusLabel = "Canceled";
          const hasImage = Boolean(currentInputs[SIGNATURE_IMAGE_BY_ROLE[roleConfig.role]]);
          acc[SIGNATURE_FIELDS[roleConfig.role]] = {
            label: status === "signed" || hasImage || status === "pending" || status === "expired" ? "Send a new link" : "Request signature",
            onClick: () => handleRequestSignature(roleConfig.role),
            disabled: isNumbering,
            status: statusLabel,
            badge: status === "signed" || hasImage ? "Signed" : undefined
          };
          return acc;
        },
        {}
      )
    : undefined;

  // A certificate number can be assigned up front; otherwise the first signature request assigns one.
  const numberAction =
    signatureEnabled && !currentInputs.certificateNumber?.trim()
      ? {
          certificateNumber: {
            label: isNumbering ? "Assigning…" : "Assign the next number",
            onClick: () => {
              void ensureCertificateNumber().catch(error => {
                console.error("Failed to assign a certificate number", error);
                toast.error(error instanceof Error ? error.message : "A certificate number couldn't be assigned. Try again.");
              });
            },
            disabled: isNumbering
          }
        }
      : undefined;

  const showVersionNote = Boolean(
    initialDocId &&
      initialTemplateVersion &&
      selectedTemplateMeta &&
      selectedTemplateMeta.id === initialTemplateId &&
      initialTemplateVersion < selectedTemplateMeta.version
  );

  return (
    <section className="flex flex-col gap-6">
      {showVersionNote ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>This template has changed since you saved</AlertTitle>
          <AlertDescription>
            The wording or layout may look a little different from your saved copy. Check the preview before you print.
          </AlertDescription>
        </Alert>
      ) : null}

      <AdminSectionCard
        title="Choose a template"
        description="Pick what you want to make. You can switch any time; what you typed is kept for each template."
      >
        <TemplateTabs tabs={templatesMeta} activeTabId={selectedTemplateId} onTabChange={handleTemplateChange} />
      </AdminSectionCard>

      {selectedTemplateMeta ? (
        <>
          <nav aria-label="Steps" className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 md:hidden">
              <p className="text-sm font-medium text-foreground">
                Step {Math.min(activeStepIndex + 1, steps.length)} of {steps.length}: {activeStep?.title}
              </p>
              <ProgressBar value={activeStepIndex + 1} max={steps.length} label="Progress through the steps" />
            </div>
            <Steps
              label="Steps in this document"
              className="hidden md:grid"
              steps={steps.map((step, index) => ({
                title: (
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex(index)}
                    className="cursor-pointer rounded-md text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {step.title}
                  </button>
                ),
                state: index < activeStepIndex ? "done" : index === activeStepIndex ? "current" : "todo"
              }))}
            />
          </nav>

          <div className={cn("grid items-start gap-6", !isReviewStep && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
            <AdminSectionCard className="min-w-0" title={selectedTemplateMeta.title} description={selectedTemplateMeta.description}>
              {!isReviewStep ? (
                <>
                  <fieldset className="min-w-0">
                    <legend className="sr-only">{activeStep?.title}</legend>
                    <DocForm fields={stepFields} values={mergedInputs} onChange={handleFieldChange} fieldActions={numberAction} />
                  </fieldset>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setActiveStepIndex(index => Math.max(0, index - 1))}
                      disabled={activeStepIndex === 0}
                    >
                      <ArrowLeft aria-hidden="true" />
                      Back
                    </Button>
                    <Button type="button" size="lg" onClick={() => setActiveStepIndex(index => Math.min(steps.length - 1, index + 1))}>
                      Next
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                  {selectedTemplate ? (
                    <div className="flex flex-col gap-3 lg:hidden">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" aria-expanded={previewOpen} onClick={() => setPreviewOpen(open => !open)}>
                          {previewOpen ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                          {previewOpen ? "Hide preview" : "Preview"}
                        </Button>
                      </div>
                      {previewOpen ? (
                        <div className="rounded-xl border border-border bg-muted/50">
                          <DocPreview template={selectedTemplate} inputs={hintedInputs} hints />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Preview</h3>
                    {selectedTemplate ? (
                      <div className="rounded-xl border border-border bg-muted/50">
                        <DocPreview
                          template={selectedTemplate}
                          inputs={mergedInputs}
                          ref={previewRef}
                          onPageCountChange={setReviewPageCount}
                          onBackgroundLoad={() => {
                            setLetterheadReady(true);
                            const format = pendingExport.current;
                            if (format) {
                              pendingExport.current = undefined;
                              void exportPage(format);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <EmptyState title="No preview yet" description="Choose a template to see a preview here." />
                    )}
                    <p className="text-sm text-muted-foreground">
                      {reviewPageCount > 1
                        ? `This is how the ${reviewPageCount} letter-size (8.5 × 11 in) pages will print and download. Pages break between sections, and every download includes all of them.`
                        : "This is how the letter-size (8.5 × 11 in) page will print and download."}
                    </p>
                  </div>

                  {signatureEnabled ? (
                    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-semibold text-foreground">Signatures</h3>
                        <p className="text-sm text-muted-foreground">Send each person a link. They sign on their phone and the signature appears here.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SIGNATURE_ROLES.map(roleConfig => {
                          const action = signatureActions?.[SIGNATURE_FIELDS[roleConfig.role]];
                          if (!action) return null;
                          return (
                            <div key={roleConfig.role} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-foreground">{roleConfig.label}</p>
                                {action.badge ? <Badge variant="success">{action.badge}</Badge> : null}
                              </div>
                              {action.status ? <p className="text-sm text-muted-foreground">{action.status}</p> : null}
                              <Button type="button" variant="outline" size="row" onClick={action.onClick} disabled={action.disabled} className="w-full">
                                {action.label}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="lg"
                            onClick={handleFinalizeSigned}
                            disabled={!selectedTemplate || isFinalizing || !letterheadReady}
                            loading={isFinalizing}
                          >
                            <FileCheck2 aria-hidden="true" />
                            Finalize &amp; save signed certificate
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          When everyone has signed, this saves the signed certificate and downloads its PDF. It can&apos;t be changed after.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="lg" onClick={handleSave} disabled={!selectedTemplate || isSaving} loading={isSaving}>
                      <Save aria-hidden="true" />
                      Save to gallery
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleExport("pdf")}
                      disabled={!selectedTemplate || isExporting || !letterheadReady}
                      className="max-sm:h-11"
                    >
                      <Download aria-hidden="true" />
                      Download PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleExport("jpeg")}
                      disabled={!selectedTemplate || isExporting || !letterheadReady}
                      className="max-sm:h-11"
                    >
                      <ImageIcon aria-hidden="true" />
                      Download image (JPEG)
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button type="button" variant="outline" size="lg" onClick={() => setActiveStepIndex(index => Math.max(0, index - 1))}>
                      <ArrowLeft aria-hidden="true" />
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </AdminSectionCard>

            {!isReviewStep && selectedTemplate ? (
              <aside aria-label="Live preview" className="hidden min-w-0 lg:block">
                <AdminSectionCard className="sticky top-20" title="Live preview" description="Updates as you type. Gray [hints] show what still needs filling in.">
                  <div className="rounded-xl border border-border bg-muted/50">
                    <DocPreview template={selectedTemplate} inputs={hintedInputs} hints />
                  </div>
                </AdminSectionCard>
              </aside>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState icon={<FileText />} title="No template selected" description="Choose a template above to start." />
      )}
      <Dialog open={Boolean(activeSession)} onOpenChange={open => (open ? undefined : setActiveQrRole(null))}>
        {activeSession ? (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Signature link: {SIGNATURE_ROLES.find(role => role.role === activeSession.role)?.label}</DialogTitle>
              <DialogDescription>Ask them to scan this code with their phone camera, or send them the link.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 p-4 text-center">
              <LocalQrCode
                value={activeSession.signUrl}
                alt="QR code for signing link"
                className="h-48 w-48 rounded-lg border border-border bg-card p-2"
              />
              <p className="text-sm text-muted-foreground">Scan on a phone to sign</p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium text-foreground">Link</p>
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm break-all text-muted-foreground">
                {activeSession.signUrl}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activeSession.signUrl);
                      toast.success("Signing link copied");
                    } catch (error) {
                      console.error("Failed to copy link", error);
                      toast.error("Couldn't copy the link. Select it and copy it by hand.");
                    }
                  }}
                >
                  <Copy aria-hidden="true" />
                  Copy link
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
