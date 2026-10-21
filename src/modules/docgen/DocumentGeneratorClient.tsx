"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import * as htmlToImage from "html-to-image";
import { useRef, useState } from "react";

export type DocumentGeneratorTemplate = {
  id: string;
  name: string;
  letterhead?: { title?: string; subtitle?: string };
  fields?: string[];
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 12,
    fontFamily: "Helvetica"
  },
  heading: {
    fontSize: 18,
    marginBottom: 6
  },
  body: {
    marginTop: 12,
    lineHeight: 1.5
  }
});

export default function DocumentGeneratorClient({
  communityId,
  communitySlug,
  templates
}: {
  communityId: string;
  communitySlug: string;
  templates: DocumentGeneratorTemplate[];
}) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState(templates[0]?.id);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const selected = templates.find(t => t.id === selectedId) || templates[0];
  const fields: string[] = selected?.fields?.length ? selected.fields : ["Recipient", "Subject", "Body"];

  const handleGenerate = async () => {
    setStatus("Generating...");
    try {
      const doc = (
        <Document>
          <Page size="A4" style={styles.page}>
            <View>
              <Text style={styles.heading}>{selected.letterhead?.title || `${communitySlug} Letter`}</Text>
              {selected.letterhead?.subtitle ? <Text>{selected.letterhead.subtitle}</Text> : null}
            </View>
            <View style={styles.body}>
              {fields.map(field => (
                <Text key={field} style={{ marginBottom: 8 }}>
                  <Text style={{ fontWeight: "bold" }}>{field}: </Text>
                  {inputs[field] || ""}
                </Text>
              ))}
            </View>
          </Page>
        </Document>
      );
      const blob = await pdf(doc).toBlob();
      downloadBlob(blob, `${communitySlug}-${selected.name}.pdf`);

      // Log file names only; the images themselves stay on this device.
      const outputRefs: string[] = [`${communitySlug}-${selected.name}.pdf`];

      const node = previewRef.current;
      if (node) {
        const pngDataUrl = await htmlToImage.toPng(node);
        const jpegDataUrl = await htmlToImage.toJpeg(node, { quality: 0.92 });
        downloadDataUrl(pngDataUrl, `${communitySlug}-${selected.name}.png`);
        downloadDataUrl(jpegDataUrl, `${communitySlug}-${selected.name}.jpg`);
        outputRefs.push(`${communitySlug}-${selected.name}.png`, `${communitySlug}-${selected.name}.jpg`);
      }

      await fetch("/api/docgen/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selected.id, inputs, outputRefs, communityId })
      });
      setStatus("Generated PDF and images.");
    } catch (err: any) {
      setStatus(`Failed to generate: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-xs lg:flex-row">
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Document Generator</h1>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase text-primary">{communitySlug}</span>
          </div>
          <label className="text-sm font-semibold text-foreground">Template</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map(field => (
              <div key={field} className="space-y-1">
                <label className="text-xs font-semibold uppercase text-muted-foreground">{field}</label>
                <input
                  value={inputs[field] || ""}
                  onChange={e => setInputs(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder={`Enter ${field}`}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Export PDF + Images
            </button>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </div>
        </div>
        <div className="flex-1">
          <div ref={previewRef} className="rounded-lg border border-border bg-card p-4 shadow-inner">
            <p className="text-lg font-semibold text-foreground">{selected.letterhead?.title || "Letterhead"}</p>
            {selected.letterhead?.subtitle ? <p className="text-sm text-muted-foreground">{selected.letterhead.subtitle}</p> : null}
            <div className="mt-4 space-y-2 text-sm text-foreground/80">
              {fields.map(field => (
                <div key={field}>
                  <span className="font-semibold">{field}: </span>
                  <span>{inputs[field] || "…"}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Preview is also used for PNG/JPEG exports.</p>
        </div>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
