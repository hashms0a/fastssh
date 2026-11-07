import { describe, expect, it } from "vitest";
import { contrastForeground, luminance, toHex } from "./colors";

describe("toHex", () => {
  it("converts the legacy rgb() form", () => {
    expect(toHex("rgb(0,43,54)")).toBe("#002b36");
    expect(toHex("rgb(48, 10, 36)")).toBe("#300a24");
  });

  it("keeps and expands hex values", () => {
    expect(toHex("#300a24")).toBe("#300a24");
    expect(toHex("#ABC")).toBe("#aabbcc");
    expect(toHex("  #fff  ")).toBe("#ffffff");
  });

  it("returns null for invalid input so the caller falls back", () => {
    expect(toHex("")).toBeNull();
    expect(toHex("blue")).toBeNull();
    expect(toHex("rgb(0,43,54,1)")).toBeNull();
    expect(toHex("rgb(300,0,0)")).toBeNull();
    expect(toHex("#12")).toBeNull();
  });
});

describe("contrastForeground", () => {
  it("picks a light foreground on a dark background", () => {
    expect(contrastForeground("#002b36")).toBe("#f2f2f2");
    expect(luminance("#000000")).toBeCloseTo(0, 3);
  });

  it("picks a dark foreground on a light background", () => {
    expect(contrastForeground("#fff")).toBe("#171717");
    expect(contrastForeground("rgb(255,255,255)")).toBe("#171717");
  });

  it("falls back to the light foreground for a bad color", () => {
    expect(contrastForeground("nope")).toBe("#f2f2f2");
    expect(luminance("nope")).toBeNull();
  });
});
