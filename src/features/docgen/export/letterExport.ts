"use client";

import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "../components/LetterheadPage";

/** Downloads are drawn at twice the page's CSS size (1632 × 2112 px for a letter page). */
export const EXPORT_PIXEL_RATIO = 2;
/** The gap between pages when several are stacked into one image. */
const STACK_GAP_PX = 24 * EXPORT_PIXEL_RATIO;

/**
 * Draws each page (a LetterheadPage element at its real 816 × 1056 px size) to a PNG data URL, one per page.
 * The size passed to html-to-image is the page's own CSS size: it lays the copy out at that size, and the
 * pixel ratio alone makes the image sharper.
 */
export async function capturePages(pages: HTMLElement[]): Promise<string[]> {
  if (pages.length === 0) throw new Error("The preview isn't ready yet. Try again in a moment.");
  // Loaded on demand: the export libraries are only needed when someone downloads.
  const { toPng } = await import("html-to-image");
  const images: string[] = [];
  for (const page of pages) {
    images.push(
      await toPng(page, {
        width: LETTER_WIDTH_PX,
        height: LETTER_HEIGHT_PX,
        pixelRatio: EXPORT_PIXEL_RATIO,
        backgroundColor: "#ffffff"
      })
    );
  }
  return images;
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** A JPEG copy of a page image on white, optionally scaled down (`scale` < 1) to make it smaller. */
export async function toJpegDataUrl(imageUrl: string, quality = 0.82, scale = 1) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** A letter-size PDF with one page image per page. */
export async function buildLetterPdf(images: string[], format: "PNG" | "JPEG") {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  images.forEach((image, index) => {
    if (index > 0) pdf.addPage("letter", "portrait");
    pdf.addImage(image, format, 0, 0, width, height);
  });
  return pdf;
}

/** Steps tried, in order, until a stored certificate fits its size limit: JPEG quality, then image scale. */
const SIZE_STEPS: Array<{ quality: number; scale: number }> = [
  { quality: 0.82, scale: 1 },
  { quality: 0.7, scale: 1 },
  { quality: 0.6, scale: 0.85 },
  { quality: 0.55, scale: 0.7 },
  { quality: 0.5, scale: 0.6 }
];

/**
 * JPEG page images whose PDF fits in `maxPdfBytes` (a stored certificate must fit in one database document).
 * Returns the images and the PDF built from them.
 */
export async function fitPagesAsJpeg(pngPages: string[], maxPdfBytes: number) {
  for (const step of SIZE_STEPS) {
    const jpegs = await Promise.all(pngPages.map(page => toJpegDataUrl(page, step.quality, step.scale)));
    const pdf = await buildLetterPdf(jpegs, "JPEG");
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    if (bytes.length <= maxPdfBytes) return { jpegs, pdfBytes: bytes };
  }
  throw new Error("This certificate is too large to save. Shorten the custom blessing or notes and try again.");
}

/** One tall JPEG with the pages one under another, separated by a light gray gap. */
export async function stackPagesAsJpeg(images: string[], quality = 0.9) {
  const loaded = await Promise.all(images.map(loadImage));
  const width = Math.max(...loaded.map(image => image.naturalWidth));
  const height = loaded.reduce((sum, image) => sum + image.naturalHeight, 0) + STACK_GAP_PX * (loaded.length - 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#e2e8f0";
  context.fillRect(0, 0, width, height);
  let y = 0;
  for (const image of loaded) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, y, image.naturalWidth, image.naturalHeight);
    context.drawImage(image, 0, y);
    y += image.naturalHeight + STACK_GAP_PX;
  }
  return canvas.toDataURL("image/jpeg", quality);
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
