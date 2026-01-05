"use client";

import { jsPDF } from "jspdf";
import * as htmlToImage from "html-to-image";
import { useMemo, useRef, useState } from "react";
import DocForm from "./DocForm";
import DocPreview from "./DocPreview";
import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "./LetterheadPage";
import TemplateTabs from "./TemplateTabs";
import { DocTemplateMeta } from "../types";
import { getTemplateById } from "../templates";

type DocBuilderProps = {
  templatesMeta: DocTemplateMeta[];
  initialTemplateId?: string;
  initialInputs?: Record<string, string>;
  initialDocId?: string;
};

type ExportFormat = "pdf" | "jpeg";

const PIXEL_RATIO = 2;

export default function DocBuilder({
  templatesMeta,
  initialTemplateId,
  initialInputs,
  initialDocId
}: DocBuilderProps) {
  const defaultTemplateId = initialTemplateId ?? templatesMeta[0]?.id ?? "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateId);
  const [inputsByTemplate, setInputsByTemplate] = useState<Record<string, Record<string, string>>>(() => {
    if (!initialInputs) return {};
    if (!defaultTemplateId) return {};
    return { [defaultTemplateId]: initialInputs };
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [letterheadReady, setLetterheadReady] = useState(false);

  const selectedTemplateMeta = useMemo(
    () => templatesMeta.find(meta => meta.id === selectedTemplateId),
    [selectedTemplateId, templatesMeta]
  );
  const selectedTemplate = useMemo(() => getTemplateById(selectedTemplateId), [selectedTemplateId]);
  const currentInputs = inputsByTemplate[selectedTemplateId] ?? {};

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
  };

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
      const response = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateMeta.id,
          templateTitle: selectedTemplateMeta.title,
          category: selectedTemplateMeta.category,
          inputs: currentInputs,
          docId: initialDocId
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

  const statusColor = statusMessage?.toLowerCase().includes("failed") ? "text-rose-600" : "text-slate-500";

  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Document generator</p>
            <h1 className="text-2xl font-semibold text-slate-900">Letter preview</h1>
            {initialDocId ? (
              <p className="text-xs text-slate-400">Editing saved document ({initialDocId})</p>
            ) : null}
          </div>
        </div>
        <div className="hidden lg:block">
          <TemplateTabs tabs={templatesMeta} activeTabId={selectedTemplateId} onTabChange={handleTemplateChange} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-5 min-w-0">
            <div className="block lg:hidden">
              <TemplateTabs tabs={templatesMeta} activeTabId={selectedTemplateId} onTabChange={handleTemplateChange} />
            </div>
            {selectedTemplateMeta ? (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-400">{selectedTemplateMeta.category}</p>
                <p className="text-sm text-slate-500">{selectedTemplateMeta.description}</p>
                <DocForm fields={selectedTemplateMeta.fields} values={currentInputs} onChange={handleFieldChange} />
              </>
            ) : (
              <p className="text-sm text-slate-500">No template selected.</p>
            )}
          </div>
          <div className="lg:col-span-7 min-w-0">
            <div className="space-y-2 lg:sticky lg:top-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Live preview</p>
              {selectedTemplate ? (
                <DocPreview
                  template={selectedTemplate}
                  inputs={currentInputs}
                  ref={previewRef}
                  onBackgroundLoad={() => setLetterheadReady(true)}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs text-slate-400">
                  Add a template to see a preview here.
                </div>
              )}
              <p className="text-xs text-slate-400">
                Preview is letter-size (8.5x11) and used for export.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-start">
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
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-primary hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
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
              </div>
              {statusMessage ? <p className={`text-xs ${statusColor}`}>{statusMessage}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
