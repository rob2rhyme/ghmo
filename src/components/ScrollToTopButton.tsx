"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { SCROLL_TOP_SHOW_AFTER_PX, scrollProgress } from "@/src/lib/scrollProgress";

const SIZE = 52;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Floating "back to top" button. A ring around it fills as the reader scrolls down the page,
 * so it doubles as a reading-progress indicator. It stays hidden near the top of the page.
 */
export function ScrollToTopButton() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      frame.current = null;
      const root = document.documentElement;
      setProgress(scrollProgress(window.scrollY, root.scrollHeight, window.innerHeight));
      setVisible(window.scrollY > SCROLL_TOP_SHOW_AFTER_PX);
    };
    const onScroll = () => {
      if (frame.current === null) frame.current = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      data-testid="scroll-to-top"
      data-progress={progress.toFixed(2)}
      // `invisible` also removes it from the tab order and from screen readers while it is hidden.
      className={`fixed right-4 bottom-4 z-40 flex size-[52px] cursor-pointer items-center justify-center rounded-full bg-card text-primary shadow-lg outline-none transition-opacity duration-200 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:right-6 sm:bottom-6 ${
        visible ? "opacity-100" : "invisible opacity-0"
      }`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden="true" focusable="false">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-border" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className="stroke-primary"
        />
      </svg>
      <ArrowUp className="relative size-5" aria-hidden="true" />
    </button>
  );
}
