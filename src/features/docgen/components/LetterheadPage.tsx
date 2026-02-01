//src/features/docgen/components/LetterheadPage.tsx
"use client";

import { forwardRef } from "react";
import { LETTERHEAD_STYLES } from "../render/renderTemplateHtml";

export const LETTER_WIDTH_PX = 816;
export const LETTER_HEIGHT_PX = 1056;
export const HEADER_SAFE_PX = 190;
export const MARGIN_X_PX = 72;
export const MARGIN_BOTTOM_PX = 96;
const SEAL_SIZE_PX = 92;

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
      <img
        src="/assets/docgen/ghmo-seal.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-10"
        style={{
          width: SEAL_SIZE_PX,
          height: SEAL_SIZE_PX,
          right: MARGIN_X_PX - 4,
          bottom: MARGIN_BOTTOM_PX - 8,
          opacity: 0.9
        }}
      />
      <div className="absolute inset-0 z-20">
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
