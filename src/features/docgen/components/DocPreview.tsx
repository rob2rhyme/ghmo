 "use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { DocTemplate } from "../types";
import { LETTERHEAD_STYLES, renderTemplateHtml } from "../render/renderTemplateHtml";
import LetterheadPage, {
  HEADER_SAFE_PX,
  LETTER_HEIGHT_PX,
  LETTER_WIDTH_PX,
  MARGIN_BOTTOM_PX,
  MARGIN_X_PX
} from "./LetterheadPage";

type DocPreviewProps = {
  template: DocTemplate;
  inputs: Record<string, string>;
  onBackgroundLoad?: () => void;
};

const VIEWER_PADDING = 32;
const CONTENT_HEIGHT_PX = LETTER_HEIGHT_PX - HEADER_SAFE_PX - MARGIN_BOTTOM_PX;

const DocPreview = forwardRef<HTMLDivElement, DocPreviewProps>(({ template, inputs, onBackgroundLoad }, ref) => {
  const previewHtml = renderTemplateHtml(template, inputs);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    if (!viewerRef.current) return undefined;

    function updateScale(width: number) {
      const horizontal = width ? Math.max(0, width - VIEWER_PADDING) / LETTER_WIDTH_PX : 1;
      setScale(Math.min(1, horizontal));
    }

    function measure() {
      const rect = viewerRef.current?.getBoundingClientRect();
      if (rect) {
        updateScale(rect.width);
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width } = entry.contentRect;
          updateScale(width);
        }
      });
      observer.observe(viewerRef.current);
      measure();
      return () => observer.disconnect();
    }

    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);
    measure();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!measureRef.current) return;

    const measure = () => {
      const height = measureRef.current?.scrollHeight ?? 0;
      const nextCount = Math.max(1, Math.ceil(height / CONTENT_HEIGHT_PX));
      setPageCount(nextCount);
    };

    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [previewHtml]);

  const pages = Array.from({ length: pageCount }, (_, index) => index);

  return (
    <div ref={viewerRef} className="relative w-full overflow-hidden">
      <div className="flex flex-col items-center gap-6 py-4">
        {pages.map(pageIndex => {
          const pageOffset = pageIndex * CONTENT_HEIGHT_PX;
          const pageHtml = `
            <div style="height:100%; overflow:hidden;">
              <div style="transform: translateY(-${pageOffset}px);">
                ${previewHtml}
              </div>
            </div>
          `;

          return (
            <div key={`preview-page-${pageIndex}`} className="flex flex-col items-center gap-2">
              <p className="text-center text-xs text-muted-foreground">Page {pageIndex + 1}</p>
              {/* The outer box takes the scaled size, so a small screen gets no empty space or sideways scroll. */}
              <div style={{ width: LETTER_WIDTH_PX * scale, height: LETTER_HEIGHT_PX * scale }}>
                <div
                  style={{
                    width: LETTER_WIDTH_PX,
                    height: LETTER_HEIGHT_PX,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left"
                  }}
                >
                  <LetterheadPage
                    ref={pageIndex === 0 ? ref : undefined}
                    contentHtml={pageHtml}
                    onBackgroundLoad={onBackgroundLoad}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        ref={measureRef}
        aria-hidden="true"
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
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
});

DocPreview.displayName = "DocPreview";

export default DocPreview;
