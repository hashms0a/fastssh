import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  badge,
  byTestId,
  clickRow,
  connectRow,
  domTabIds,
  doubleClickRow,
  expectRecentLine,
  expectText,
  focusTerm,
  hookTabIds,
  landingVisible,
  loadFixture,
  openExtraTab,
  quitApp,
  readBuffer,
  readCols,
  selectTab,
  shot,
  runCommand,
} from "../helpers";

/**
 * Stage 4 acceptance: the PTY manager, host notebooks and the local shell.
 * Terminal state is read through window.__fastsshTest (see ../helpers.ts),
 * never from a screenshot.
 *
 * Each test starts from loadFixture("legacy"), which restarts the app: tabs
 * are in-memory, so a reload also guarantees no session leaks into the next
 * test.
 */

const orphanLines = (): string[] => {
  try {
    // Anchored so the shell running pgrep itself does not match.
    return execSync("pgrep -af '^fastssh-probe'", { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
};

describe("terminal tabs + local shell (Stage 4)", () => {
  before(async () => {
    await loadFixture("legacy");
  });

  // Test 1: R8/R20 - the built-in Localhost and the sanitized environment.
  it("double-click Localhost opens a tab with the sanitized env", async () => {
    await loadFixture("legacy");
    expect(await landingVisible()).toBe(true);
    await doubleClickRow("Localhost");

    const [tabId] = await hookTabIds();
    expect(tabId).toBeTruthy();
    expect(await (await byTestId("notebook")).isExisting()).toBe(true);
    expect(await landingVisible()).toBe(false);

    await runCommand(tabId!, "echo $TERM $COLORTERM");
    await expectText(tabId!, "xterm-256color truecolor");

    // R20: no AppImage variables leak into a child process.
    await runCommand(tabId!, "env | grep -c APPDIR");
    await expectRecentLine(tabId!, "0");
  });

  // Test 2: R10 - tabs belong to the host; switching hosts keeps buffers.
  it("3 tabs survive a host switch; scrollback and the badge hold", async () => {
    await loadFixture("legacy");
    await clickRow("Localhost");
    await (await byTestId("landing-connect")).click();
    await openExtraTab();
    await openExtraTab();

    const ids = await hookTabIds();
    expect(ids).toHaveLength(3);
    // Titles: the host name, then " (2)", " (3)" (task 4.7).
    const titles: string[] = [];
    for (const el of await $$('[data-testid="tab"]')) titles.push((await el.getAttribute("data-title")) ?? "");
    expect(titles[0]).toBe("Localhost");
    expect(titles[2]).toBe("Localhost (3)");
    expect(await badge("Localhost")).toBe("3");
    await shot("stage_04", "notebook-3-tabs.png");

    await selectTab(ids[1]!);
    await runCommand(ids[1]!, "seq 1 3000");
    await expectText(ids[1]!, "3000", 20000);

    // Switch to another host: the landing card is visible, nothing unmounts.
    await clickRow("item10");
    expect(await landingVisible()).toBe(true);
    expect(await $('[data-testid="notebook"][data-host-id="local-localhost"]').isExisting()).toBe(true);

    await clickRow("Localhost");
    expect(await landingVisible()).toBe(false);
    const text = await readBuffer(ids[1]!);
    expect(text.split("\n")).toContain("1");
    expect(text.split("\n")).toContain("3000");

    // Close one tab -> the badge follows (task 4.13).
    await browser.execute((id) => {
      const tab = document.querySelector(`[data-testid="tab"][data-tab-id="${id}"]`);
      tab?.querySelector('[data-testid="tab-close"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, ids[2]!);
    await browser.waitUntil(async () => (await badge("Localhost")) === "2", { timeout: 8000, interval: 250 });
  });

  // Test 3: R17 - Ctrl+Shift+T / Ctrl+Shift+W (auto-repeat is a [unit] bullet).
  it("Ctrl+Shift+T opens a tab, Ctrl+Shift+W closes the focused one", async () => {
    await loadFixture("legacy");
    await clickRow("Localhost");
    await (await byTestId("landing-connect")).click();
    await browser.waitUntil(async () => (await domTabIds()).length === 1, { timeout: 8000 });

    const [first] = await hookTabIds();
    await focusTerm(first!);
    await browser.keys(["Control", "Shift", "t"]);
    await browser.waitUntil(async () => (await domTabIds()).length === 2, { timeout: 8000, interval: 250 });

    await browser.keys(["Control", "Shift", "w"]);
    await browser.waitUntil(async () => (await domTabIds()).length === 1, { timeout: 8000, interval: 250 });

    // Header "Local Shell": selects Localhost, opens a tab only when it has none.
    await (await byTestId("local-shell")).click();
    await browser.pause(500);
    expect(await domTabIds()).toHaveLength(1);
  });

  // Test 4: task 4.12 - a clean exit closes the tab, the landing returns.
  it("exit closes the tab and the landing card comes back", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "exit");
    await browser.waitUntil(async () => (await domTabIds()).length === 0, { timeout: 10000, interval: 250 });
    expect(await landingVisible()).toBe(true);
  });

  // Test 5: V7 resize - the PTY follows the window, not just the DOM.
  it("resizing the window resizes the PTY (tput cols == cols(activeTab))", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "stty rows 40 cols 120; tput cols");
    await expectRecentLine(tabId, "120");

    for (const [w, h] of [
      [900, 600],
      [1300, 800],
    ] as const) {
      await browser.setWindowSize(w, h);
      await browser.pause(600);
      await runCommand(tabId, "tput cols");
      const active = (await browser.execute(() => window.__fastsshTest?.activeTabId() ?? null)) as string;
      expect(active).toBe(tabId);
      const hook = await readCols(tabId);
      expect(hook).toBeGreaterThan(2);
      await expectRecentLine(tabId, String(hook), 10000);
    }
    await browser.setWindowSize(1100, 640);
  });

  // Test 6: 68 MB of output must not freeze the UI (plan Stage 4 notes).
  it("Ctrl+C interrupts a 68 MB cat and the prompt still works", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");

    const t0 = Date.now();
    await runCommand(tabId, "cat ~/fastssh-testenv/sshd/big.txt");
    await browser.pause(1000);
    await focusTerm(tabId);
    await browser.keys(["Control", "c"]);

    const interrupted = Date.now() - t0;
    await runCommand(tabId, "echo alive-after-interrupt");
    await expectText(tabId, "alive-after-interrupt", 12000);
    // The buffer is capped by scrollback, not unbounded.
    expect(await browser.execute((id) => window.__fastsshTest?.bufferLength(id) ?? 0, tabId)).toBeLessThan(60000);
    expect(interrupted).toBeLessThan(25000);
  });

  // Test 7 (last, and it quits the app): R20 - no PTY child outlives it.
  it("quitting kills every PTY child", async () => {
    await loadFixture("legacy");
    await clickRow("Localhost");
    await (await byTestId("landing-connect")).click();
    await openExtraTab();
    await openExtraTab();

    for (const id of await hookTabIds()) {
      await selectTab(id);
      await runCommand(id, "exec -a fastssh-probe bash");
    }
    await browser.waitUntil(() => orphanLines().length >= 3, { timeout: 15000, interval: 400 });

    await quitApp();
    // kill_all() runs on RunEvent::Exit, so the probe shells are gone.
    expect(orphanLines()).toEqual([]);
  });
});
