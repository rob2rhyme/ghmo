/**
 * Signature images for certificates: dark ink on a transparent background, trimmed to the ink, so a signature
 * sits on the white certificate like ink on paper. Works for new signatures (dark ink on transparent) and for
 * ones drawn on the old signing pad (light ink on a navy background).
 */

/** The ink colour printed on certificates (a near-black navy). */
export const INK_RGB = [11, 18, 32] as const;
/** Pixels fainter than this (0–255 alpha) don't count as ink when trimming. */
const INK_THRESHOLD = 24;

const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export type InkResult = {
  /** RGBA pixels, same size as the input: ink colour everywhere, with the ink's strength as alpha. */
  data: Uint8ClampedArray<ArrayBuffer>;
  /** The ink's bounding box, or null when nothing was drawn. */
  box: { x: number; y: number; width: number; height: number } | null;
};

/**
 * Turns signature pixels into ink on transparent. The background is read from the four corners: when they are
 * opaque (an old pad that painted its background in), each pixel's ink strength is how far its brightness is
 * from the background's; otherwise the drawing's own alpha is kept.
 */
export function signatureToInk(pixels: Uint8ClampedArray, width: number, height: number): InkResult {
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const opaqueBackground = corners.every(index => pixels[index + 3] > 200);
  const backgroundLuminance = opaqueBackground
    ? corners.reduce((sum, index) => sum + luminance(pixels[index], pixels[index + 1], pixels[index + 2]), 0) / corners.length
    : 0;
  // The ink is assumed to be near the far end of the brightness scale from the background; strokes that get
  // most of the way there count as solid ink.
  const contrastRange = 0.8 * Math.max(0.25, backgroundLuminance > 0.5 ? backgroundLuminance : 1 - backgroundLuminance);

  const data = new Uint8ClampedArray(pixels.length);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = at(x, y);
      const alpha = pixels[index + 3];
      let strength: number;
      if (opaqueBackground) {
        const distance = Math.abs(luminance(pixels[index], pixels[index + 1], pixels[index + 2]) - backgroundLuminance);
        strength = Math.round(Math.min(1, distance / contrastRange) * alpha);
      } else {
        strength = alpha;
      }
      data[index] = INK_RGB[0];
      data[index + 1] = INK_RGB[1];
      data[index + 2] = INK_RGB[2];
      data[index + 3] = strength;
      if (strength > INK_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const box = maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return { data, box };
}

/** Grows a box by `padding` on every side, kept inside the image. */
export function padBox(box: NonNullable<InkResult["box"]>, padding: number, width: number, height: number) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  return { x, y, width: Math.min(width, box.x + box.width + padding) - x, height: Math.min(height, box.y + box.height + padding) - y };
}

/** Browser only: a signature PNG data URL as dark ink on transparent, trimmed to the ink. Null when it's blank. */
export async function cleanSignatureCanvas(source: HTMLCanvasElement | HTMLImageElement): Promise<string | null> {
  const width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  if (!width || !height) return null;
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const context = work.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0);
  const { data, box } = signatureToInk(context.getImageData(0, 0, width, height).data, width, height);
  if (!box) return null;
  context.putImageData(new ImageData(data, width, height), 0, 0);
  const trimmed = padBox(box, Math.round(Math.min(width, height) * 0.04), width, height);
  const out = document.createElement("canvas");
  out.width = trimmed.width;
  out.height = trimmed.height;
  out.getContext("2d")!.drawImage(work, trimmed.x, trimmed.y, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return out.toDataURL("image/png");
}

/** Browser only: cleans a signature image given as a data URL; returns the original if it can't be read. */
export async function cleanSignatureDataUrl(dataUrl: string): Promise<string> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return (await cleanSignatureCanvas(image)) ?? dataUrl;
  } catch {
    return dataUrl;
  }
}
