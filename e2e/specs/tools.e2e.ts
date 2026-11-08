import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  connectRow,
  domTabIds,
  focusTerm,
  hookClipboard,
  hookFullscreen,
  hookMarkerLine,
  hookTabIds,
  hookUnread,
  hookViewportY,
  loadFixture,
  openExtraTab,
  parseCount,
  readBuffer,
  recentLines,
  rowDotVisible,
  runCommand,
  searchCount,
  selectTab,
  shot,
  tabDotVisible,
  toastTexts,
  typeInto,
} from "../helpers";

/**
 * Stage 6 acceptance, part 1: the shortcut matrix (spec section 9, R17), the
 * search toolbar (R14), Alt+C / Alt+Up (R15) and the unread dots (R13).
 * Terminal state is read through window.__fastsshTest; keys go through
 * browser.keys after focusing the xterm textarea, which proves the chord
 * survives xterm's key handler instead of reaching the shell.
 * e2e/specs/tools-menu.e2e.ts is part 2 (the right-click menu and clipboard).
 */

const activeTab = async (): Promise<string | null> =>
  (await browser.execute(() => window.__fastsshTest?.activeTabId() ?? null)) as string | null;

const lastLine = async (tabId: string): Promise<string> => {
  const lines = (await readBuffer(tabId)).split("\n");
  return lines[lines.length - 1] ?? "";
};

describe("terminal tools: shortcuts, search, unread (Stage 6)", () => {
  // Row: Ctrl+Shift+T / W, Ctrl+Shift+Left / Right (wrapping).
  it("Ctrl+Shift+T adds a tab, Ctrl+Shift+W closes it, Left/Right switch with wrap", async () => {
    await loadFixture("legacy");
    const first = await connectRow("Localhost");
    await openExtraTab();
    const ids = await hookTabIds();
    expect(ids).toHaveLength(2);
    const second = ids[1]!;
    expect(await activeTab()).toBe(second);

    await focusTerm(second);
    await browser.keys(["Control", "Shift", "t"]);
    await browser.waitUntil(async () => (await hookTabIds()).length === 3, { timeout: 8000, interval: 250 });
    expect(await activeTab()).toBe((await hookTabIds())[2]!);

    await browser.keys(["Control", "Shift", "w"]);
    await browser.waitUntil(async () => (await hookTabIds()).length === 2, { timeout: 8000, interval: 250 });
    expect(await activeTab()).toBe(second);

    await browser.keys(["Control", "Shift", "ArrowLeft"]);
    await browser.waitUntil(async () => (await activeTab()) === first, { timeout: 6000, interval: 250 });
    await browser.keys(["Control", "Shift", "ArrowRight"]);
    await browser.waitUntil(async () => (await activeTab()) === second, { timeout: 6000, interval: 250 });
    // Wrapping: Right from the last tab goes back to the first.
    await browser.keys(["Control", "Shift", "ArrowRight"]);
    await browser.waitUntil(async () => (await activeTab()) === first, { timeout: 6000, interval: 250 });
    expect(await domTabIds()).toHaveLength(2);
  });

  // Row: Ctrl+Shift+F, Ctrl+G, Ctrl+Shift+G + the Cyclic toggle.
  it("Ctrl+Shift+F opens the toolbar, Ctrl+G/Ctrl+Shift+G step, Cyclic off stops", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "seq 1 2");
    await (await byTestId("notebook")).waitForExist();

    await focusTerm(tabId);
    await browser.keys(["Control", "Shift", "f"]);
    await (await byTestId("search-toolbar")).waitForExist({ timeout: 6000 });
    await typeInto("search-input", "1");
    await browser.waitUntil(async () => (await searchCount()).includes("/"), { timeout: 6000, interval: 250 });
    const first = parseCount(await searchCount());
    expect(first?.[0]).toBe(1);
    // "1" appears in the echoed command line and in the output: 2 matches.
    expect(first?.[1]).toBeGreaterThanOrEqual(2);

    await browser.keys(["Control", "g"]);
    await browser.waitUntil(async () => parseCount(await searchCount())?.[0] === 2, { timeout: 6000, interval: 250 });
    await browser.keys(["Control", "Shift", "g"]);
    await browser.waitUntil(async () => parseCount(await searchCount())?.[0] === 1, { timeout: 6000, interval: 250 });

    // Cyclic off at the last match: Next stays put and says "No more matches".
    await clickInPage("search-cyclic");
    await browser.waitUntil(async () => parseCount(await searchCount())?.[0] === 1, { timeout: 6000, interval: 250 });
    await browser.keys(["Control", "g"]);
    await browser.waitUntil(async () => parseCount(await searchCount())?.[0] === 2, { timeout: 6000, interval: 250 });
    await shot("stage_06", "search-toolbar.png");
    await browser.keys(["Control", "g"]);
    await browser.waitUntil(async () => (await searchCount()) === "No more matches", { timeout: 6000, interval: 250 });

    // Escape closes the toolbar and hands focus back to the terminal.
    await browser.keys(["Escape"]);
    await expect(await byTestId("search-toolbar")).not.toBeExisting();
    expect(await toastTexts()).toEqual([]);
  });

  // Bullet: search a string only the output holds -> "1 / 1"; Case off finds nothing.
  it("search shows 1 / 1, and Case off makes an upper-case query find nothing", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    // `rev` prints "olleh", which is not in the typed command line.
    await runCommand(tabId, "echo hello | rev");
    await browser.waitUntil(async () => (await recentLines(tabId, 3)).includes("olleh"), { timeout: 12000 });

    await focusTerm(tabId);
    await browser.keys(["Control", "Shift", "f"]);
    await (await byTestId("search-input")).waitForExist({ timeout: 6000 });
    await typeInto("search-input", "olleh");
    await browser.waitUntil(async () => (await searchCount()) === "1 / 1", { timeout: 8000, interval: 250 });

    // Ctrl+G on the single match keeps it, so the toolbar still reads 1 / 1.
    await browser.keys(["Control", "g"]);
    await browser.pause(400);
    expect(await searchCount()).toBe("1 / 1");

    // Case off: the same query in upper case matches nothing.
    await clickInPage("search-close");
    await browser.keys(["Control", "Shift", "f"]);
    await (await byTestId("search-input")).waitForExist({ timeout: 6000 });
    await clickInPage("search-case");
    await typeInto("search-input", "OLLEH");
    await browser.waitUntil(async () => (await searchCount()) === "Not found", { timeout: 8000, interval: 250 });
    await clickInPage("search-case"); // Case back on: the query matches again
    await browser.waitUntil(async () => (await searchCount()) === "1 / 1", { timeout: 8000, interval: 250 });
  });

  // Bullet: Alt+C puts the last command's output on the clipboard.
  it("Alt+C copies the last command output (clipboard reads a\\nb\\nc)", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "printf 'a\\nb\\nc\\n'");
    await browser.waitUntil(async () => (await recentLines(tabId, 5)).includes("c"), { timeout: 12000 });

    await focusTerm(tabId);
    await browser.keys(["Alt", "c"]);
    await browser.waitUntil(async () => (await hookClipboard()) === "a\nb\nc", { timeout: 8000, interval: 250 });
    const toasts = await toastTexts();
    expect(toasts.some((t) => t.includes("Copied 3 lines"))).toBe(true);
  });

  // Bullet: Alt+Up scrolls to the marker line.
  it("Alt+Up scrolls the buffer to the start of the last command", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "seq 1 500");
    await browser.waitUntil(async () => (await recentLines(tabId, 4)).includes("500"), { timeout: 20000 });

    await focusTerm(tabId);
    const bottomY = await hookViewportY(tabId);
    expect(bottomY).toBeGreaterThan(0); // the viewport sits at the end of 500 lines

    await browser.keys(["Alt", "ArrowUp"]);
    await browser.waitUntil(async () => (await hookViewportY(tabId)) === (await hookMarkerLine(tabId)), {
      timeout: 8000,
      interval: 250,
    });
    expect(await hookViewportY(tabId)).toBeLessThan(bottomY);
    // The marker line holds the command itself.
    const line = await browser.execute((id) => {
      const t = window.__fastsshTest;
      return t ? (t.getText(id).split("\n")[t.markerLine(id)] ?? "") : "";
    }, tabId);
    expect(line).toContain("seq 1 500");
  });

  // Bullet: at a prompt the copy chords reach nothing but the app.
  it("Ctrl+Shift+C and Alt+C insert nothing into the shell line", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "echo copy-check");
    await browser.waitUntil(async () => (await recentLines(tabId, 3)).includes("copy-check"), { timeout: 12000 });

    await focusTerm(tabId);
    const before = await lastLine(tabId);
    await browser.keys(["Control", "Shift", "c"]);
    await browser.pause(400);
    expect(await lastLine(tabId)).toBe(before);
    expect(await readBuffer(tabId)).not.toContain("^C");
    // An empty selection copies nothing, and nothing is reported.
    expect(await toastTexts()).toEqual([]);

    await browser.keys(["Alt", "c"]);
    await browser.pause(600);
    expect(await lastLine(tabId)).toBe(before);
    expect(await readBuffer(tabId)).not.toContain("^C");
    expect(await toastTexts()).not.toEqual([]); // "Copied 1 line", and the shell got nothing
  });

  // Row: Ctrl+Shift+E reports that the file browser arrives in Stage 7.
  it("Ctrl+Shift+E toasts Coming soon", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await focusTerm(tabId);
    await browser.keys(["Control", "Shift", "e"]);
    await browser.waitUntil(async () => (await toastTexts()).some((t) => t.includes("Coming soon")), {
      timeout: 6000,
      interval: 250,
    });
  });

  // Bullet: the dots on the background tab and its row, cleared by focusing.
  it("output in a background tab lights the tab dot and the row dot", async () => {
    await loadFixture("legacy");
    const a = await connectRow("Localhost");
    await openExtraTab();
    const b = (await hookTabIds())[1]!;

    await selectTab(a);
    await runCommand(a, "sleep 1.5; echo late-output");
    await selectTab(b); // A is now the background tab
    await browser.waitUntil(async () => (await readBuffer(a)).includes("late-output"), {
      timeout: 12000,
      interval: 300,
    });

    await browser.waitUntil(async () => (await tabDotVisible(a)) && (await rowDotVisible("Localhost")), {
      timeout: 6000,
      interval: 250,
    });
    expect(await hookUnread(a)).toBe(true);
    expect(await hookUnread(b)).toBe(false);

    await selectTab(a); // focusing clears both
    await browser.waitUntil(async () => !(await tabDotVisible(a)) && !(await rowDotVisible("Localhost")), {
      timeout: 6000,
      interval: 250,
    });
    expect(await hookUnread(a)).toBe(false);
  });

  // Bullet: F11 toggles fullscreen in both directions.
  it("F11 toggles fullscreen on and off", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await browser.setWindowSize(1100, 640);
    await focusTerm(tabId);
    expect(await hookFullscreen()).toBe(false);

    await browser.keys(["F11"]);
    await browser.waitUntil(async () => (await hookFullscreen()) === true, { timeout: 8000, interval: 300 });
    const full = await browser.execute(() => [window.innerWidth, window.screen.width]);
    expect(full[0]).toBeGreaterThanOrEqual(full[1]! - 2);

    await focusTerm(tabId);
    await browser.keys(["F11"]);
    await browser.waitUntil(async () => (await hookFullscreen()) === false, { timeout: 8000, interval: 300 });
    const restored = await browser.execute(() => window.innerWidth);
    expect(restored).toBeLessThan((await browser.execute(() => window.screen.width)) - 2);
  });
});
