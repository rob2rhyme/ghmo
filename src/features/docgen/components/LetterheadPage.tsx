"use client";

import { forwardRef } from "react";
import { LETTERHEAD_STYLES } from "../render/renderTemplateHtml";

export const LETTER_WIDTH_PX = 816;
export const LETTER_HEIGHT_PX = 1056;
export const HEADER_SAFE_PX = 220;
export const MARGIN_X_PX = 72;
export const MARGIN_BOTTOM_PX = 72;

type LetterheadPageProps = {
  contentHtml: string;
  onBackgroundLoad?: () => void;
};

const LetterheadPage = forwardRef<HTMLDivElement, LetterheadPageProps>(
  ({ contentHtml, onBackgroundLoad }, ref) => {
  const handleLoad = () => {
    onBackgroundLoad?.();
  };
  const handleError = () => {
    onBackgroundLoad?.();
  };

  return (
    <div
      ref={ref}
      className="relative overflow-hidden border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.25)]"
      style={{ width: LETTER_WIDTH_PX, height: LETTER_HEIGHT_PX }}
    >
      <img
        src="/assets/docgen/ghmo-letterhead.png"
        alt=""
        aria-hidden="true"
        onLoad={handleLoad}
        onError={handleError}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-top"
      />
        <div className="absolute inset-0">
          <style dangerouslySetInnerHTML={{ __html: LETTERHEAD_STYLES }} />
          <div
            className="h-full w-full"
            style={{
              paddingTop: HEADER_SAFE_PX,
              paddingInline: MARGIN_X_PX,
              paddingBottom: MARGIN_BOTTOM_PX
            }}
          >
            <div
              className="h-full w-full text-slate-900"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </div>
        </div>
      </div>
    );
  }
);

LetterheadPage.displayName = "LetterheadPage";

export default LetterheadPage;
