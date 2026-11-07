import { describe, expect, it } from "vitest";
import { parseFontSpec } from "./fontSpec";

describe("parseFontSpec", () => {
  it("reads a family and a size", () => {
    expect(parseFontSpec("Monospace 11")).toEqual({ family: "Monospace", size: 11 });
    expect(parseFontSpec("Ubuntu Mono 13")).toEqual({ family: "Ubuntu Mono", size: 13 });
    expect(parseFontSpec("  DejaVu Sans Mono 9  ")).toEqual({ family: "DejaVu Sans Mono", size: 9 });
  });

  it("returns null for input without a usable size", () => {
    expect(parseFontSpec("")).toBeNull();
    expect(parseFontSpec("Monospace")).toBeNull();
    expect(parseFontSpec("11")).toBeNull();
    expect(parseFontSpec("Monospace 3")).toBeNull(); // below MIN_SIZE
    expect(parseFontSpec("Monospace 100")).toBeNull(); // no 3-digit size
    expect(parseFontSpec("Monospace 11.5")).toBeNull();
  });
});
