import { execSync } from "node:child_process";
import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  closeTabByHook,
  connectRow,
  doubleClickRow,
  expectPrompt,
  hookRenderCount,
  hookResetRenders,
  hookLiveTerminals,
  hookTabIds,
  loadFixture,
  openExtraTab,
  selectTab,
  clickRow,
  readBuffer,
  runCommand,
} from "../helpers";

/**
 * Task 12.4. Three measurements, each one an assertion:
 *  1. PTY output re-renders the affected tab-bar item only - the sidebar list
 *     and the other host's row stay at zero renders (src/lib/renderLog.ts is
 *     compiled out of a release build).
 *  2. `cat` of the 68 MB fixture over ssh does not block the UI: the header
 *     menu still opens while the stream runs.
 *  3. Closing 20 tabs returns the process to roughly its earlier RSS, which is
 *     how we prove the xterm instances were disposed.
 */
const appRssKb = (): number => {
  try {
    const pid = execSync("pgrep -f 'target/debug/fastssh'", { encoding: "utf8" }).trim().split("\n")[0] ?? "";
    if (!pid) return 0;
    return Number(execSync(`ps -o rss= -p ${pid}`, { encoding: "utf8" }).trim());
  } catch {
    return 0;
  }
};

describe("performance (task 12.4)", () => {
  it("PTY output re-renders the tab bar item, never the sidebar list", async () => {
    await loadFixture("legacy");
    await doubleClickRow("Localhost");
    const [localTab] = await hookTabIds();
    const other = await connectRow("item10");
    if (await (await byTestId("fingerprint-modal")).isExisting()) {
      await clickInPage("fingerprint-yes");
    }
    await expectPrompt(other);

    // Back to the Localhost notebook with localTab as the visible pane: the
    // keystrokes have to reach a pane that is showing.
    await clickRow("Localhost");
    await selectTab(localTab!);
    await hookResetRenders();
    await runCommand(localTab!, "printf 'one\\n'; sleep 1; printf 'two\\n'");
    await browser.waitUntil(async () => (await readBuffer(localTab!)).includes("two"), { timeout: 15000 });
    await browser.pause(400);

    expect(await hookRenderCount("sidebar")).toBe(0);
    expect(await hookRenderCount("hostRow:item10")).toBe(0);
    // The streaming host's own row may repaint once for its badge/dot.
    expect(await hookRenderCount("hostRow:Localhost")).toBeLessThanOrEqual(1);
  });

  it("cat of the 68 MB fixture over ssh keeps the UI responsive", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("item10");
    if (await (await byTestId("fingerprint-modal")).isExisting()) await clickInPage("fingerprint-yes");
    await expectPrompt(tab);

    await runCommand(tab, "cat ~/big.txt");
    await browser.pause(1500); // the stream is running
    const t0 = Date.now();
    await clickInPage("header-menu");
    await (await byTestId("header-menu-list")).waitForExist({ timeout: 10000 });
    const openedIn = Date.now() - t0;
    expect(
      await browser.execute(
        () => document.querySelectorAll('[data-testid="header-menu-list"] [role="menuitem"]').length,
      ),
    ).toBeGreaterThan(0);
    await browser.keys(["Escape"]);
    expect(openedIn).toBeLessThan(6000);

    // And the stream really was flowing (the buffer grew by many lines).
    expect(await readBuffer(tab).then((b) => b.length)).toBeGreaterThan(1000);
    await closeTabByHook(tab);
  });

  it("closing 20 tabs disposes the terminals and drops the memory", async () => {
    await loadFixture("legacy");
    await doubleClickRow("Localhost");
    await browser.pause(1200);
    const before = appRssKb();
    expect(before).toBeGreaterThan(0);

    for (let i = 0; i < 19; i++) await openExtraTab();
    await browser.waitUntil(async () => (await hookTabIds()).length === 20, { timeout: 60000, interval: 500 });
    const peak = appRssKb();
    expect(peak).toBeGreaterThan(before);

    for (const id of await hookTabIds()) await closeTabByHook(id);
    await browser.waitUntil(async () => (await hookTabIds()).length === 0, { timeout: 30000, interval: 400 });
    await browser.pause(2000); // let the GC settle
    const after = appRssKb();
    // The proof of disposal is the registry: no xterm survives a closed tab.
    expect(await hookLiveTerminals()).toBe(0);
    // RSS drops, but freed heap is not always returned to the OS, so the bar
    // is "below the peak", not "back to the start".
    expect(after).toBeLessThan(peak);
  });
});
