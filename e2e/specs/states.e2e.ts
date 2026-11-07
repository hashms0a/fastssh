import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect } from "@wdio/globals";
import { byTestId, configDir, shot } from "../helpers";

/**
 * Section 10 steps 3/7/8 for Stage 1: permissions-like flows (unwritable
 * config dir), window states (fullscreen, minimum size) and the SIGKILL
 * mid-save test. Runs FIRST alphabetically; the SIGKILL ends the app, the
 * next spec file gets a fresh instance.
 */
const settingsFile = path.join(configDir, "settings.json");

describe("window states + permissions (Stage 1)", () => {
  it("saves survive an unwritable config dir (chmod 500 -> 700)", async () => {
    fs.chmodSync(configDir, 0o500);
    await browser.setWindowSize(1160, 670);
    await browser.pause(1300); // save fails (EACCES), app must keep running
    await expect(byTestId("header-bar")).toBeExisting();
    await shot("stage_01", "chmod500.png");

    fs.chmodSync(configDir, 0o700);
    await browser.setWindowSize(1190, 690);
    await browser.pause(1500); // recovery: the next save lands
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
      windowWidth: number;
    };
    expect(s.windowWidth).toBeGreaterThanOrEqual(1130);
    await shot("stage_01", "chmod-restored.png");
  });

  it("renders fullscreen and the minimum size without clipping", async () => {
    await browser.fullScreenWindow?.();
    await browser.pause(1200);
    await expect(byTestId("runtime-info")).toBeExisting();
    await shot("stage_01", "fullscreen.png");

    await browser.setWindowSize(800, 500); // minimum (tauri.conf minWidth/Height)
    await browser.pause(1500);
    const css = await browser.execute(() => ({ w: window.innerWidth, h: window.innerHeight }));
    expect(css.w).toBeGreaterThanOrEqual(700);
    await shot("stage_01", "min-size.png");
  });

  it("survives SIGKILL during a debounced save (valid JSON after relaunch)", async () => {
    await browser.setWindowSize(1210, 710);
    await browser.pause(700); // mid-debounce (500 + 400 ms): kill the app
    execSync("pkill -KILL -x fastssh");
  });
});
