import { describe, expect, it } from "vitest";
import {
  MAX_FONT_SIZE,
  MAX_SCROLLBACK,
  MIN_SCROLLBACK,
  fontSizeFromText,
  scrollbackDisplay,
  scrollbackFromText,
} from "./prefs";

describe("scrollback field mapping (task 8.1)", () => {
  it("shows -1 as the value xterm keeps", () => {
    expect(scrollbackDisplay(-1)).toBe("Unlimited (50000)");
    expect(scrollbackDisplay(-7)).toBe("Unlimited (50000)");
    expect(scrollbackDisplay(1000)).toBe("1000");
  });

  it("maps Unlimited and -1 back to -1", () => {
    expect(scrollbackFromText("Unlimited")).toBe(-1);
    expect(scrollbackFromText("  unlimited  ")).toBe(-1);
    expect(scrollbackFromText("-1")).toBe(-1);
  });

  it("clamps a number into the settings bounds", () => {
    expect(scrollbackFromText("1000")).toBe(1000);
    expect(scrollbackFromText("5")).toBe(MIN_SCROLLBACK);
    expect(scrollbackFromText("99999999")).toBe(MAX_SCROLLBACK);
    expect(scrollbackFromText("1200.6")).toBe(1201);
  });

  it("returns null for text that is not a value, so the field reverts", () => {
    expect(scrollbackFromText("")).toBeNull();
    expect(scrollbackFromText("abc")).toBeNull();
    expect(scrollbackFromText("12abc")).toBeNull();
  });

  it("round-trips a committed value", () => {
    for (const n of [-1, 100, 5000, MAX_SCROLLBACK]) {
      expect(scrollbackFromText(scrollbackDisplay(n))).toBe(n);
    }
  });
});

describe("font size field (task 8.1)", () => {
  it("accepts 6-48 and clamps outside it", () => {
    expect(fontSizeFromText("13")).toBe(13);
    expect(fontSizeFromText("6")).toBe(6);
    expect(fontSizeFromText("48")).toBe(MAX_FONT_SIZE);
    expect(fontSizeFromText("2")).toBe(6);
    expect(fontSizeFromText("500")).toBe(MAX_FONT_SIZE);
  });

  it("returns null for empty or non-numeric text", () => {
    expect(fontSizeFromText("")).toBeNull();
    expect(fontSizeFromText("mono")).toBeNull();
  });
});
