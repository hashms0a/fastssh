import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LOCALHOST_HOST, type Host } from "../types/models";
import { createTerminal, disposeAll, getEntry } from "./terminalRegistry";
import { terminalOptions } from "./terminalOptions";
import { applyAppearance, applyTheme } from "./settingsSync";

function host(name: string, over: Partial<Host> = {}): Host {
  return { ...LOCALHOST_HOST, id: name, name, host: "10.0.0.1", local: undefined, ...over };
}

afterEach(() => disposeAll());

describe("applyAppearance (task 8.2)", () => {
  it("re-sets font, size, background and scrollback of an open tab", () => {
    const h = host("alpha");
    const entry = createTerminal("t1", terminalOptions(h, DEFAULT_SETTINGS), h.id);
    applyAppearance(
      {
        ...DEFAULT_SETTINGS,
        terminalFont: "DejaVu Sans Mono",
        terminalFontSize: 20,
        terminalBackgroundColor: "#202020",
        scrollbackLines: 1000,
      },
      [h],
    );
    expect(entry.term.options.fontFamily).toBe("DejaVu Sans Mono");
    expect(entry.term.options.fontSize).toBe(20);
    expect(entry.term.options.scrollback).toBe(1000);
    expect(entry.term.options.theme?.background).toBe("#202020");
  });

  it("keeps the color and font of a host that has its own", () => {
    const own = host("item10", { font: "Monospace 11", color: "rgb(0,43,54)" });
    const plain = host("alpha");
    createTerminal("t-own", terminalOptions(own, DEFAULT_SETTINGS), own.id);
    createTerminal("t-plain", terminalOptions(plain, DEFAULT_SETTINGS), plain.id);
    applyAppearance(
      {
        ...DEFAULT_SETTINGS,
        terminalFont: "DejaVu Sans Mono",
        terminalFontSize: 22,
        terminalBackgroundColor: "#ff0000",
      },
      [own, plain],
    );
    expect(getEntry("t-own")?.term.options.fontFamily).toBe("Monospace");
    expect(getEntry("t-own")?.term.options.fontSize).toBe(11);
    expect(getEntry("t-own")?.term.options.theme?.background).toBe("#002b36");
    expect(getEntry("t-plain")?.term.options.fontFamily).toBe("DejaVu Sans Mono");
    expect(getEntry("t-plain")?.term.options.fontSize).toBe(22);
    expect(getEntry("t-plain")?.term.options.theme?.background).toBe("#ff0000");
  });

  it("Unlimited stays at the value xterm keeps", () => {
    const h = host("alpha");
    const entry = createTerminal("t2", terminalOptions(h, DEFAULT_SETTINGS), h.id);
    applyAppearance({ ...DEFAULT_SETTINGS, scrollbackLines: 500 }, [h]);
    expect(entry.term.options.scrollback).toBe(500);
    applyAppearance({ ...DEFAULT_SETTINGS, scrollbackLines: -1 }, [h]);
    expect(entry.term.options.scrollback).toBe(50000);
  });

  it("a tab whose host is gone follows the settings", () => {
    const entry = createTerminal("t3", terminalOptions(host("alpha"), DEFAULT_SETTINGS), "deleted-host");
    applyAppearance({ ...DEFAULT_SETTINGS, terminalFontSize: 30 }, []);
    expect(entry.term.options.fontSize).toBe(30);
  });
});

describe("applyTheme (task 8.1)", () => {
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("puts and takes the dark class without a reload", () => {
    applyTheme(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    applyTheme(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
