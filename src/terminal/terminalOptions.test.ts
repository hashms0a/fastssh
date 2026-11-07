import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type AppSettings, type Host } from "../types/models";
import { terminalOptions } from "./terminalOptions";

const settings: AppSettings = { ...DEFAULT_SETTINGS };

describe("terminalOptions", () => {
  it("uses the host color and font when they are set", () => {
    const host: Host = { ...LOCALHOST_HOST, color: "rgb(0,43,54)", font: "Monospace 11" };
    const o = terminalOptions(host, settings);
    expect(o.theme?.background).toBe("#002b36");
    expect(o.theme?.foreground).toBe("#f2f2f2");
    expect(o.fontFamily).toBe("Monospace");
    expect(o.fontSize).toBe(11);
    expect(o.cursorBlink).toBe(true);
  });

  it("falls back to the settings when the host strings are empty or invalid", () => {
    const o = terminalOptions({ ...LOCALHOST_HOST, color: "blue", font: "nope" }, settings);
    expect(o.theme?.background).toBe(settings.terminalBackgroundColor);
    expect(o.fontFamily).toBe(settings.terminalFont);
    expect(o.fontSize).toBe(settings.terminalFontSize);
  });

  it("maps scrollback -1 to 50000 and keeps a real value", () => {
    expect(terminalOptions(LOCALHOST_HOST, settings).scrollback).toBe(50000);
    expect(terminalOptions(LOCALHOST_HOST, { ...settings, scrollbackLines: 500 }).scrollback).toBe(500);
  });

  it("uses a dark foreground on a light host color", () => {
    const o = terminalOptions({ ...LOCALHOST_HOST, color: "#ffffff" }, settings);
    expect(o.theme?.foreground).toBe("#171717");
    expect(o.theme?.cursor).toBe("#171717");
  });

  it("survives a broken settings color", () => {
    const o = terminalOptions(LOCALHOST_HOST, { ...settings, terminalBackgroundColor: "wat" });
    expect(o.theme?.background).toBe("#1e1e1e");
  });
});
