import { describe, expect, it } from "vitest";
import { INK_RGB, padBox, signatureToInk } from "@/src/features/docgen/signatureInk";

function image(width: number, height: number, background: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(background, i);
  const paint = (x: number, y: number, rgba: [number, number, number, number]) => data.set(rgba, (y * width + x) * 4);
  return { data, paint };
}

describe("signature ink", () => {
  it("turns the old pad (light ink on navy) into dark ink on transparent, trimmed to the ink", () => {
    const { data, paint } = image(20, 10, [11, 18, 32, 255]);
    paint(5, 3, [248, 250, 252, 255]);
    paint(9, 6, [248, 250, 252, 255]);
    const { data: ink, box } = signatureToInk(data, 20, 10);
    expect(box).toEqual({ x: 5, y: 3, width: 5, height: 4 });
    const at = (x: number, y: number) => Array.from(ink.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4));
    expect(at(5, 3)).toEqual([...INK_RGB, 255]);
    expect(at(0, 0)[3]).toBe(0);
  });

  it("keeps a new signature's own strokes (dark ink on transparent)", () => {
    const { data, paint } = image(10, 10, [0, 0, 0, 0]);
    paint(2, 2, [11, 18, 32, 200]);
    const { box, data: ink } = signatureToInk(data, 10, 10);
    expect(box).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    expect(ink[(2 * 10 + 2) * 4 + 3]).toBe(200);
  });

  it("finds no ink in an empty pad", () => {
    expect(signatureToInk(image(8, 8, [255, 255, 255, 255]).data, 8, 8).box).toBeNull();
    expect(signatureToInk(image(8, 8, [0, 0, 0, 0]).data, 8, 8).box).toBeNull();
  });

  it("pads the trimmed box without leaving the image", () => {
    expect(padBox({ x: 1, y: 1, width: 3, height: 3 }, 4, 10, 10)).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });
});
