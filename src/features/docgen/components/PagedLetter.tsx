"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { LETTERHEAD_STYLES } from "../render/renderTemplateHtml";
import { measureLayout, pickPageBreaks } from "../render/pagination";
import LetterheadPage, { HEADER_SAFE_PX, LETTER_HEIGHT_PX, LETTER_WIDTH_PX, MARGIN_BOTTOM_PX, MARGIN_X_PX } from "./LetterheadPage";

/** The height of the writing area on one letter page. */
export const CONTENT_HEIGHT_PX = LETTER_HEIGHT_PX - HEADER_SAFE_PX - MARGIN_BOTTOM_PX;

export type PagedLetterHandle = {
  /** The page elements, in order, at their real 816 × 1056 px size (what the export draws). */
  pages: () => HTMLDivElement[];
  /** Resolves once fonts and images are in and the page breaks have been worked out again. */
  settle: () => Promise<void>;
};

type PagedLetterProps = {
  html: string;
  /** How much the pages are shrunk on screen; the pages themselves keep their real size. */
  scale: number;
  onBackgroundLoad?: () => void;
  /** Called when the number of pages changes. */
  onPageCountChange?: (count: number) => void;
  /** Show "Page n of m" above each page. */
  pageLabels?: boolean;
  className?: string;
};

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const sameStarts = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 0.5);

/**
 * A letter on as many letterhead pages as it needs. The content is laid out once, out of sight, at the page's
 * content width; each page shows its own slice, and page breaks fall between blocks (see pagination.ts).
 */
const PagedLetter = forwardRef<PagedLetterHandle, PagedLetterProps>(
  ({ html, scale, onBackgroundLoad, onPageCountChange, pageLabels = true, className }, ref) => {
    const measureRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [layout, setLayout] = useState<{ starts: number[]; total: number }>({ starts: [0], total: CONTENT_HEIGHT_PX });

    const measure = useCallback(() => {
      const content = measureRef.current;
      if (!content) return;
      const { blocks, totalHeight } = measureLayout(content);
      const starts = pickPageBreaks(blocks, CONTENT_HEIGHT_PX, totalHeight);
      setLayout(previous => (sameStarts(previous.starts, starts) && Math.abs(previous.total - totalHeight) < 0.5 ? previous : { starts, total: totalHeight }));
    }, []);

    useLayoutEffect(() => {
      measure();
    }, [html, measure]);

    useEffect(() => {
      const content = measureRef.current;
      if (!content) return undefined;
      // Images (signatures, the QR code) and web fonts change the layout after the first measurement.
      content.addEventListener("load", measure, true);
      let cancelled = false;
      void document.fonts?.ready.then(() => {
        if (!cancelled) measure();
      });
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
      observer?.observe(content);
      return () => {
        cancelled = true;
        content.removeEventListener("load", measure, true);
        observer?.disconnect();
      };
    }, [measure]);

    const pageCount = layout.starts.length;
    useEffect(() => {
      onPageCountChange?.(pageCount);
    }, [onPageCountChange, pageCount]);

    useImperativeHandle(
      ref,
      () => ({
        // Read at call time (a page that is no longer drawn has a null ref), so a handle kept across a re-render still
        // returns the current pages.
        pages: () => pageRefs.current.filter((page): page is HTMLDivElement => Boolean(page)),
        settle: async () => {
          await document.fonts?.ready;
          const images = Array.from(measureRef.current?.querySelectorAll("img") ?? []);
          await Promise.all(images.map(image => image.decode().catch(() => undefined)));
          measure();
          // Two frames: React draws the new pages, then the browser lays them out.
          await nextFrame();
          await nextFrame();
        }
      }),
      [measure]
    );

    return (
      <div className={className}>
        <div className="flex flex-col items-center gap-6">
          {layout.starts.map((start, index) => {
            const end = layout.starts[index + 1] ?? Math.max(layout.total, start);
            const height = Math.min(CONTENT_HEIGHT_PX, Math.max(0, end - start));
            // The slice ends exactly at the break, so the start of the next block never peeks in at the bottom.
            const pageHtml = `<div style="height:${height}px; overflow:hidden;"><div style="transform: translateY(-${start}px);">${html}</div></div>`;
            return (
              <div key={`page-${index}`} className="flex flex-col items-center gap-2">
                {pageLabels && pageCount > 1 ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Page {index + 1} of {pageCount}
                  </p>
                ) : null}
                {/* The outer box takes the scaled size, so a small screen gets no empty space or sideways scroll. */}
                <div style={{ width: LETTER_WIDTH_PX * scale, height: LETTER_HEIGHT_PX * scale }}>
                  <div style={{ width: LETTER_WIDTH_PX, height: LETTER_HEIGHT_PX, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    <LetterheadPage
                      ref={element => {
                        pageRefs.current[index] = element;
                      }}
                      contentHtml={pageHtml}
                      onBackgroundLoad={index === 0 ? onBackgroundLoad : undefined}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: "relative", height: 0, overflow: "hidden" }} aria-hidden="true">
          <div
            style={{
              position: "absolute",
              left: "-10000px",
              top: 0,
              width: LETTER_WIDTH_PX - MARGIN_X_PX * 2,
              visibility: "hidden",
              pointerEvents: "none"
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: LETTERHEAD_STYLES }} />
            <div ref={measureRef} className="text-slate-900" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    );
  }
);

PagedLetter.displayName = "PagedLetter";

export default PagedLetter;
