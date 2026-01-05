 "use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { DocTemplate } from "../types";
import { renderTemplateHtml } from "../render/renderTemplateHtml";
import LetterheadPage, { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "./LetterheadPage";

type DocPreviewProps = {
  template: DocTemplate;
  inputs: Record<string, string>;
  onBackgroundLoad?: () => void;
};

const VIEWER_PADDING = 32;

const DocPreview = forwardRef<HTMLDivElement, DocPreviewProps>(({ template, inputs, onBackgroundLoad }, ref) => {
  const previewHtml = renderTemplateHtml(template, inputs);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!viewerRef.current) return undefined;

    function updateScale(width: number, height: number) {
      const horizontal = width ? Math.max(0, width - VIEWER_PADDING) / LETTER_WIDTH_PX : 1;
      const vertical = height ? Math.max(0, height - VIEWER_PADDING) / LETTER_HEIGHT_PX : 1;
      setScale(Math.min(1, horizontal, vertical));
    }

    function measure() {
      const rect = viewerRef.current?.getBoundingClientRect();
      if (rect) {
        updateScale(rect.width, rect.height);
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          updateScale(width, height);
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
    <div
      ref={viewerRef}
      className="w-full overflow-auto"
      style={{ minHeight: LETTER_HEIGHT_PX * 0.6 }}
    >
      <div className="flex justify-center py-4">
        <div
          style={{
            width: LETTER_WIDTH_PX,
            height: LETTER_HEIGHT_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top center"
          }}
        >
          <LetterheadPage
            ref={ref}
            contentHtml={previewHtml}
            onBackgroundLoad={onBackgroundLoad}
          />
        </div>
      </div>
    </div>
  );
});

DocPreview.displayName = "DocPreview";

export default DocPreview;
