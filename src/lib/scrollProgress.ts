/** How far down the page the reader is, from 0 (top) to 1 (bottom). */
export function scrollProgress(scrollTop: number, scrollHeight: number, viewportHeight: number): number {
  const scrollable = scrollHeight - viewportHeight;
  if (!(scrollable > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(1, Math.max(0, scrollTop / scrollable));
}

/** The button only appears once the reader has moved a little way down. */
export const SCROLL_TOP_SHOW_AFTER_PX = 320;
