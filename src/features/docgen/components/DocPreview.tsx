"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { DocTemplate } from "../types";
import { renderTemplateHtml } from "../render/renderTemplateHtml";
import { LETTER_WIDTH_PX } from "./LetterheadPage";
import PagedLetter, { type PagedLetterHandle } from "./PagedLetter";

type DocPreviewProps = {
  template: DocTemplate;
  inputs: Record<string, string>;
  onBackgroundLoad?: () => void;
  onPageCountChange?: (count: number) => void;
  /** Live preview only: show `hintValue(...)` inputs as grey [bracketed] hints. Never used for the copy that is exported. */
  hints?: boolean;
};

export type DocPreviewHandle = PagedLetterHandle;

const HINT_MARK = "⁣";
const HINT_PATTERN = new RegExp(`${HINT_MARK}([^${HINT_MARK}<>]*)${HINT_MARK}`, "g");

/** An input value that the live preview shows as a grey "[label]" hint instead of the template's fallback text. */
export const hintValue = (label: string) => `${HINT_MARK}${label}${HINT_MARK}`;

const showHints = (html: string) => html.replace(HINT_PATTERN, '<span style="color:#8a94a6;">[$1]</span>');

const VIEWER_PADDING = 32;

/** The document on letter pages, as many as it needs; the ref gives the pages for download (see PagedLetter). */
const DocPreview = forwardRef<DocPreviewHandle, DocPreviewProps>(({ template, inputs, onBackgroundLoad, onPageCountChange, hints = false }, ref) => {
  const rendered = renderTemplateHtml(template, inputs);
  const previewHtml = hints ? showHints(rendered) : rendered;
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

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

  return (
    <div ref={viewerRef} className="relative w-full overflow-hidden">
      <PagedLetter
        ref={ref}
        html={previewHtml}
        scale={scale}
        onBackgroundLoad={onBackgroundLoad}
        onPageCountChange={onPageCountChange}
        className="py-4"
      />
    </div>
  );
});

DocPreview.displayName = "DocPreview";

export default DocPreview;
