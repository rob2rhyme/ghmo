import { describe, expect, it } from "vitest";
import { safeEqual } from "@/src/lib/security/compare";

describe("safeEqual", () => {
  it("matches equal strings", () => expect(safeEqual("s3cret-value", "s3cret-value")).toBe(true));
  it("rejects different strings", () => expect(safeEqual("s3cret-value", "s3cret-valuf")).toBe(false));
  it("rejects different lengths", () => expect(safeEqual("abc", "abcd")).toBe(false));
  it("rejects missing values", () => {
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", null)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
});
