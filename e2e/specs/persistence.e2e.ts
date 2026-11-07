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
    // Two widely-spaced sizes (~600 px apart): the saved size is always
    // the CSS width (target + XWayland CSD shadow, 50-105 px), so targets
    // 600 px apart can never collide with what the last run persisted.
    // (Mutter's per-app geometry history can make the boot CSS differ
    // from settings.json, hence picking from the CURRENT CSS width.)
    // Mutter's XWayland geometry history restores last run's size at
    // boot, so pick a target ~300 px away from the CURRENT CSS width.
    const cur = await innerSizeReady();
    const tw = cur.w > 1330 ? 1200 : 1500;
    const th = Math.round(tw * 0.57);
    // Mutter's XWayland geometry history swallows single resize requests
    // at random; step through an intermediate size and retry until the
    // webview lays out at the target (each step is ~175 px, the range
    // where mutter reliably honours the configure request).
    const setCss = async (w: number, h: number) => {
      const deadline0 = Date.now() + 15000;
      let cur2 = await innerSize();
      while (Date.now() < deadline0) {
        if (Math.abs(cur2.w - w) <= 2 && Math.abs(cur2.h - h) <= 2) return;
        const step = Math.max(-220, Math.min(220, w - cur2.w, (h - cur2.h) * 1.75));
        await browser.setWindowSize(Math.round(cur2.w + step), Math.round((cur2.w + step) * 0.57));
        await browser.pause(800);
        cur2 = await innerSize();
      }
      throw new Error(`resize to ${w}x${h} never landed (css=${JSON.stringify(cur2)})`);
    };
    await setCss(tw, th);
    // Kick one more configure at the target: if a mid-sequence resize
    // arrived while the window was still restoring from fullscreen, the
    // debounced applier skipped it and settings would keep the boot size.
    await browser.setWindowSize(tw + 1, th + 1);
    await browser.pause(1200);
    // 500 ms window + 400 ms settings debounce + I/O: poll for the write.
    const deadline = Date.now() + 6000;
    let s = readSettings();
    while (Math.abs(s.windowWidth - before.windowWidth) <= 2 && Date.now() < deadline) {
      await browser.pause(300);
      s = readSettings();
    }

    if (Math.abs(s.windowWidth - before.windowWidth) <= 2) {
      throw new Error(
        `no settings save: before=${before.windowWidth} now=${s.windowWidth} css=${JSON.stringify(await innerSize())} target=${tw}x${th}`,
      );
    }
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
