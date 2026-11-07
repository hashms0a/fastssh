import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@wdio/globals";
import { byTestId, configDir, shot } from "../helpers";
import { prevFile, tmpDir } from "../paths";

/**
 * Stage 1 acceptance: a corrupt data file is kept, renamed to
 * <name>.corrupt-<unix-ts> and named in a dismissible banner.
 */
const T = process.env.FASTSSH_TESTENV ?? path.join(os.homedir(), "fastssh-testenv");
const badDir = path.join(T, "bad");

describe("corrupt data files (Stage 1)", () => {
  it("renames the 3 bad files, warns with their new names, and is dismissible", async () => {
    for (const f of ["hosts.json", "accounts.json", "bookmarks.json"]) {
      fs.copyFileSync(path.join(badDir, f), path.join(configDir, f));
    }
    // Reload the webview: main.tsx runs load_all again with the new fixtures.
    await browser.reloadSession();
    await browser.pause(1500);

    // Stage 2 moved the warnings banner onto the toast stack (task 2.12).
    const banner = await byTestId("toasts");
    await expect(banner).toBeExisting();
    // (li.getText() comes back empty through WebKitWebDriver; read the HTML.)
    const html = await banner.getHTML();
    for (const name of ["hosts.json", "accounts.json", "bookmarks.json"]) {
      expect(html).toContain(`${name}.corrupt-`);
    }

    // The renamed file kept its original bytes.
    const aside = fs
      .readdirSync(configDir)
      .filter((f) => f.startsWith("hosts.json.corrupt-"))
      .pop();
    expect(aside).toBeDefined();
    expect(fs.readFileSync(path.join(configDir, aside ?? ""), "utf8")).toContain('"trunc');

    await shot("stage_01", "warnings-banner.png");
    // Two warning toasts per file (parse error + rename note); dismissing
    // the warnings group clears all of them.
    // The W3C pointer in WebKitGTK reports this banner button as
    // non-interactable, so the click goes in-page.
    await browser.execute(() => {
      (document.querySelector('[data-testid="warnings-dismiss"]') as HTMLElement).click();
    });
    await expect(banner).not.toBeExisting();

    // Exact restart proof (acceptance "size is the same, within 2 px"):
    // snapshot size -> reload (Rust setup sizes the window from
    // settings.json) -> the size matches to the pixel.
    const sizeBefore = await browser.execute(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    await browser.reloadSession();
    await browser.pause(1500);
    const sizeAfter = await browser.execute(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    expect(sizeAfter.w).toBe(sizeBefore.w);
    expect(sizeAfter.h).toBe(sizeBefore.h);

    // Snapshot the on-disk state for the NEXT e2e run (this is the suite's
    // last spec; states' SIGKILL ran before this reload).
    fs.mkdirSync(tmpDir, { recursive: true });
    // The sandbox starts without settings.json; the app writes it on the first
    // change, so a snapshot is optional.
    const settings = path.join(configDir, "settings.json");
    if (fs.existsSync(settings)) fs.copyFileSync(settings, prevFile);
  });
});
