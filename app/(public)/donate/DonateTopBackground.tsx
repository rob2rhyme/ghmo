"use client";

import React, { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function DonateTopBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  const bgRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const [bgHeight, setBgHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!coverRef.current) {
      return;
    }

    const element = coverRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextHeight = clamp(
        Math.ceil(entry.contentRect.height + 24),
        320,
        1400
      );
      setBgHeight(nextHeight);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const bgEl = bgRef.current;
    if (!bgEl) {
      return;
    }
    if (prefersReducedMotion()) {
      bgEl.style.transform = "translate3d(0, 0px, 0) scale(1)";
      return;
    }

    let rafId = 0;
    const onScroll = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const offset = Math.min(24, window.scrollY * 0.08);
        bgEl.style.transform = `translate3d(0, ${offset}px, 0) scale(1.02)`;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden">
      <div
        ref={bgRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[65vh] bg-[url('/assets/Ghmo-building.png')] bg-cover bg-center bg-no-repeat will-change-transform sm:h-[55vh] lg:h-[45vh]"
        style={bgHeight ? { height: `${bgHeight}px` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/65 via-slate-950/35 to-transparent" />
      </div>
      <div ref={coverRef} className="relative z-10">
        {children}
      </div>
    </div>
  );
}
