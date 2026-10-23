import { describe, expect, it } from "vitest";
import { SCROLL_TOP_SHOW_AFTER_PX, scrollProgress } from "@/src/lib/scrollProgress";

describe("scrollProgress", () => {
  it("is 0 at the top and 1 at the bottom", () => {
    expect(scrollProgress(0, 3000, 1000)).toBe(0);
    expect(scrollProgress(2000, 3000, 1000)).toBe(1);
  });

  it("is proportional in between", () => {
    expect(scrollProgress(1000, 3000, 1000)).toBe(0.5);
  });

  it("stays within 0..1 for overscroll", () => {
    expect(scrollProgress(-50, 3000, 1000)).toBe(0);
    expect(scrollProgress(2500, 3000, 1000)).toBe(1);
  });

  it("is 0 when the page does not scroll or the input is not a number", () => {
    expect(scrollProgress(0, 800, 1000)).toBe(0);
    expect(scrollProgress(0, 1000, 1000)).toBe(0);
    expect(scrollProgress(Number.NaN, 3000, 1000)).toBe(0);
  });

  it("shows the button only after a short scroll", () => {
    expect(SCROLL_TOP_SHOW_AFTER_PX).toBeGreaterThan(0);
  });
});
