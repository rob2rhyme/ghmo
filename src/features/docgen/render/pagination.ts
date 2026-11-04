/**
 * Splitting a letter's content into pages. The content is laid out once at the page's content width; each page
 * then shows a slice of it. Slices end between blocks (a paragraph, a list item, a form row, a signature block,
 * anything marked `avoid-break`), never through one, so no line or signature row is cut at a page edge.
 */

export type LayoutBlock = {
  /** Offsets from the top of the content, in CSS pixels. */
  top: number;
  bottom: number;
  /** A heading: a page should not end right after it. */
  keepWithNext?: boolean;
};

/** Elements that must not be split across pages. */
export const UNBREAKABLE_SELECTOR = [
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "tr",
  ".ghmo-cert-row",
  ".ghmo-cert-line",
  ".ghmo-cert-signature-block",
  ".avoid-break",
  ".ghmo-avoid-break",
  "[data-avoid-break]"
].join(",");

/** Headings that belong with what follows them. */
export const KEEP_WITH_NEXT_SELECTOR = "h1,h2,h3,h4,h5,h6,.ghmo-cert-heading,.ghmo-cert-subheading,.ghmo-letter-meta";

const EPSILON = 0.5;
/** A heading counts as "right before" a break when the gap between them is smaller than this. */
const KEEP_WITH_NEXT_GAP = 48;

function crosses(block: LayoutBlock, y: number) {
  return block.top < y - EPSILON && block.bottom > y + EPSILON;
}

function strandsHeading(blocks: LayoutBlock[], y: number) {
  return blocks.some(block => block.keepWithNext && block.top < y - EPSILON && block.bottom <= y + EPSILON && y - block.bottom < KEEP_WITH_NEXT_GAP);
}

/**
 * Where each page starts, as offsets into the content (the first is always 0). Each page holds at most
 * `pageHeight`. A page ends at the lowest block boundary that fits and cuts through no block; a page that ends
 * right after a heading is avoided when another boundary fits. Only a single block taller than a whole page
 * is cut, at the page height.
 */
export function pickPageBreaks(blocks: LayoutBlock[], pageHeight: number, totalHeight: number): number[] {
  if (!(pageHeight > 0) || !(totalHeight > pageHeight + EPSILON)) return [0];
  const candidates = Array.from(new Set(blocks.map(block => block.top)))
    .filter(top => Number.isFinite(top))
    .sort((a, b) => b - a);
  const starts = [0];
  let start = 0;
  while (totalHeight - start > pageHeight + EPSILON) {
    const limit = start + pageHeight;
    const fits = candidates.filter(y => y > start + EPSILON && y <= limit + EPSILON && !blocks.some(block => crosses(block, y)));
    const next = fits.find(y => !strandsHeading(blocks, y)) ?? fits[0] ?? limit;
    starts.push(next);
    start = next;
  }
  return starts;
}

/** Reads the block positions of laid-out content (browser only). */
export function measureLayout(content: HTMLElement): { blocks: LayoutBlock[]; totalHeight: number } {
  const origin = content.getBoundingClientRect().top;
  const keep = new Set(content.querySelectorAll(KEEP_WITH_NEXT_SELECTOR));
  const blocks: LayoutBlock[] = [];
  content.querySelectorAll<HTMLElement>(UNBREAKABLE_SELECTOR).forEach(element => {
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0) return;
    blocks.push({ top: rect.top - origin, bottom: rect.bottom - origin, keepWithNext: keep.has(element) });
  });
  return { blocks, totalHeight: Math.max(content.scrollHeight, ...blocks.map(block => block.bottom)) };
}
