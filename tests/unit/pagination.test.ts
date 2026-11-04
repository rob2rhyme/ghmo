import { describe, expect, it } from "vitest";
import { pickPageBreaks, type LayoutBlock } from "@/src/features/docgen/render/pagination";

/** Paragraphs of the given heights, 10 px apart, from the top. */
function stack(heights: number[], gap = 10): LayoutBlock[] {
  let top = 0;
  return heights.map(height => {
    const block = { top, bottom: top + height };
    top += height + gap;
    return block;
  });
}

describe("page breaks", () => {
  it("keeps short content on one page", () => {
    expect(pickPageBreaks(stack([100, 100]), 770, 210)).toEqual([0]);
    expect(pickPageBreaks([], 770, 770)).toEqual([0]);
  });

  it("breaks before the block that would cross the page edge, never through it", () => {
    // Blocks at 0-300, 310-610, 620-920: the third crosses 770, so page 2 starts at its top.
    const blocks = stack([300, 300, 300]);
    expect(pickPageBreaks(blocks, 770, 920)).toEqual([0, 620]);
  });

  it("never cuts a block marked avoid-break (a signature section) even when its lines would fit", () => {
    const lines = stack([20, 20, 20, 20, 20], 0).map(b => ({ top: b.top + 700, bottom: b.bottom + 700 }));
    const section = { top: 700, bottom: 800 };
    expect(pickPageBreaks([...stack([690]), section, ...lines], 770, 800)).toEqual([0, 700]);
    // Without the section, the lines may split at a line boundary.
    expect(pickPageBreaks([...stack([690]), ...lines], 770, 800)).toEqual([0, 760]);
  });

  it("does not end a page right after a heading", () => {
    const blocks: LayoutBlock[] = [
      { top: 0, bottom: 700 },
      { top: 710, bottom: 730, keepWithNext: true },
      { top: 740, bottom: 800 }
    ];
    expect(pickPageBreaks(blocks, 770, 800)).toEqual([0, 710]);
  });

  it("falls back to a cut only for a block taller than a page", () => {
    expect(pickPageBreaks([{ top: 0, bottom: 2000 }], 770, 2000)).toEqual([0, 770, 1540]);
  });

  it("handles many pages, each starting at a block boundary within one page of the last", () => {
    const blocks = stack(Array.from({ length: 60 }, (_, i) => 40 + (i % 5) * 13));
    const total = blocks.at(-1)!.bottom;
    const starts = pickPageBreaks(blocks, 770, total);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeLessThanOrEqual(770);
      expect(blocks.some(b => b.top === starts[i])).toBe(true);
      expect(blocks.some(b => b.top < starts[i] && b.bottom > starts[i])).toBe(false);
    }
    expect(total - starts.at(-1)!).toBeLessThanOrEqual(770);
  });
});
