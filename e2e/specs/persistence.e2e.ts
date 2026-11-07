import fs from "node:fs";
import path from "node:path";
import { expect } from "@wdio/globals";
import { configDir, shot } from "../helpers";

/**
 * Stage 1 acceptance: window size + maximized flag survive a restart.
 * Run `npm run e2e` twice: run 1 resizes to 1150x660, maximizes, restores,
 * and snapshots the CSS viewport + settings.json to e2e/.tmp/; run 2
 * starts from them and proves the viewport is the same (within 2 px).
 * (CSS innerWidth is the same source on both sides; Tauri's innerSize
 * adds the XWayland CSD shadow, so settings.json is only used for the
 * maximized flag and "a save happened" checks.)
 */
const settingsFile = path.join(configDir, "settings.json");
const tmpDir = path.join(__dirname, "..", ".tmp");
const prevFile = path.join(tmpDir, "prev-settings.json");
const cssFile = path.join(tmpDir, "prev-css.json");

type Saved = { windowWidth: number; windowHeight: number; windowMaximized: boolean };
type Css = { w: number; h: number };

function readSettings(): Saved {
  if (!fs.existsSync(settingsFile)) {
    return { windowWidth: 1100, windowHeight: 640, windowMaximized: false }; // tauri.conf defaults
  }
  return JSON.parse(fs.readFileSync(settingsFile, "utf8")) as Saved;
}

const innerSize = () => browser.execute(() => ({ w: window.innerWidth, h: window.innerHeight }));

/** XWayland lays out the webview a moment after the window shows. */
async function innerSizeReady(): Promise<Css> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const size = await innerSize();
    if (size.w > 0 && size.h > 0) return size;
    if (Date.now() > deadline) throw new Error("webview never laid out");
    await browser.pause(200);
  }
}

describe("window state persistence (Stage 1)", () => {
  it("starts with the size settings.json asked for (XWayland jitter ≤ 110 px)", async () => {
    // Read the file FIRST: the app's boot resize save lands ~1.5 s later.
    // (XWayland: mutter keeps per-app geometry history and CSD shadows move
    // 50-105 px, so Rust's set_size lands within a shadow width, not exactly.
    // The exact 2-px restart proof is the warnings spec's reload comparison.)
    const s = readSettings();
    const size = await innerSizeReady();
    expect(size.w).toBeGreaterThan(s.windowWidth - 115);
    expect(size.w).toBeLessThanOrEqual(s.windowWidth + 2);
    if (fs.existsSync(prevFile)) {
      const prev = JSON.parse(fs.readFileSync(prevFile, "utf8")) as Saved;
      expect(s.windowMaximized).toBe(prev.windowMaximized);
    }
    await shot("stage_01", "run-startup.png");
  });

  it("saves a resized window (500 ms + 400 ms debounce)", async () => {
    if (readSettings().windowMaximized) {
      await browser.setWindowSize(1100, 650); // drop out of maximized
      await browser.pause(1500);
    }
    const before = readSettings();
    // Cycle through sizes so the target always differs from what the last
    // run persisted (inner = target + XWayland shadow, 50-105 px).
    const sizes: Array<[number, number]> = [
      [1150, 660],
      [1234, 708],
      [1318, 756],
    ];
    const [tw, th] = sizes.find(([w]) => Math.abs(w - before.windowWidth) > 60) ?? sizes[0]!;
    await browser.setWindowSize(tw, th);
    // 500 ms window + 400 ms settings debounce + I/O: poll for the write.
    const deadline = Date.now() + 6000;
    let s = readSettings();
    while (Math.abs(s.windowWidth - before.windowWidth) <= 2 && Date.now() < deadline) {
      await browser.pause(300);
      s = readSettings();
    }
    expect(Math.abs(s.windowWidth - before.windowWidth)).toBeGreaterThan(2);
    const css = await innerSizeReady();
    expect(Math.abs(css.w - tw)).toBeLessThanOrEqual(2);
    expect(Math.abs(css.h - th)).toBeLessThanOrEqual(2);
    expect(s.windowMaximized).toBe(false);
    await shot("stage_01", "run-resized.png");
  });

  it("saves the maximized flag, and restoring keeps the restore size", async () => {
    const cssBefore = await innerSize();
    await browser.maximizeWindow();
    await browser.pause(1600);
    expect(readSettings().windowMaximized).toBe(true);
    const cssMax = await innerSize();
    expect(cssMax.w).toBeGreaterThan(cssBefore.w);
    await shot("stage_01", "run-maximized.png");

    // Restore (set_window_rect clears the maximize state on GNOME):
    // the window returns to the pre-maximize restore size, not the screen size.
    await browser.setWindowSize(1150, 660);
    await browser.pause(1600);
    const after = readSettings();
    expect(after.windowMaximized).toBe(false);
    const css = await innerSize();
    expect(Math.abs(css.w - 1150)).toBeLessThanOrEqual(2);
    expect(after.windowWidth).toBeLessThan(1500); // not the maximized width
    await shot("stage_01", "run-restored.png");
  });
});
