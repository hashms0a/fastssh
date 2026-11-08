import { expect } from "@wdio/globals";
import {
  byTestId,
  doubleClickRow,
  readCols,
  horizontalOverflow,
  loadFixture,
  openExtraTab,
  shot,
  typeInto,
  windowCommand,
} from "../helpers";

/**
 * Task 12.3 (Test Matrix Win = all for Stage 12): minimum size, maximize,
 * fullscreen and back, with the overflow rule checked at every step - the
 * header, the sidebar and the tab bar must never scroll horizontally, and a
 * long tab title must be cut with an ellipsis instead of pushing the bar out.
 *
 * The window is driven through Tauri's own window commands: the W3C
 * setWindowSize command is not implemented by tauri-driver/WebKitWebDriver.
 */
const activeTab = async (): Promise<string | null> =>
  (await browser.execute(() => window.__fastsshTest?.activeTabId() ?? null)) as string | null;

/** The webview's own viewport - what the layout has to fit into. */
const viewport = async (): Promise<{ width: number; height: number }> =>
  (await browser.execute(() => ({ width: window.innerWidth, height: window.innerHeight }))) as {
    width: number;
    height: number;
  };

const overflowOk = async (where: string): Promise<void> => {
  const o = await horizontalOverflow();
  // The failing ids and the window state show up in the assertion output.
  expect(
    Object.entries(o)
      .filter(([, px]) => px > 0)
      .map(([id, px]) => `${where}: ${id} +${px}px`),
  ).toEqual([]);
};

describe("window states and overflow (task 12.3)", () => {
  before(async () => {
    await loadFixture("legacy");
  });

  it("the window can go to its minimum size and nothing overflows", async () => {
    await doubleClickRow("Localhost");
    await openExtraTab();
    // Measure the *visible* tab: a hidden pane never re-fits (safeFit skips a
    // container that measures 0), so cols only move for the active tab.
    const tabId = await activeTab();
    const wide = await readCols(tabId!);

    await windowCommand("set_size", { value: { Physical: { width: 820, height: 520 } } });
    await browser.pause(900);
    const vp = await viewport();
    expect(vp.width).toBeGreaterThanOrEqual(800); // the window's own minimum
    expect(vp.width).toBeLessThanOrEqual(820);
    const narrow = await readCols(tabId!);
    expect(narrow).toBeLessThan(wide);
    await overflowOk("800x500");
    await shot("stage_12", "window-min.png");
  });

  it("maximizing and un-maximizing keep the layout intact", async () => {
    await windowCommand("maximize");
    await browser.pause(700);
    await overflowOk("maximized");
    await shot("stage_12", "window-maximized.png");
    await windowCommand("unmaximize");
    await browser.pause(700);
    await overflowOk("restored");
  });

  it("fullscreen (and back) still fits the terminal and shows no overflow", async () => {
    await windowCommand("set_fullscreen", { value: true });
    await browser.pause(900);
    const tabId = await activeTab();
    const cols = await readCols(tabId!);
    expect(cols).toBeGreaterThan(0);
    await overflowOk("fullscreen");
    await windowCommand("set_fullscreen", { value: false });
    await browser.pause(900);
    await overflowOk("windowed again");
  });

  it("a long tab title is truncated with an ellipsis, and the bar still fits", async () => {
    const tabId = await activeTab();
    const row = await $(`[data-testid="tab"][data-tab-id="${tabId}"]`);
    await row.doubleClick();
    const field = await byTestId("tab-rename");
    await field.waitForExist({ timeout: 5000 });
    const long = "connection-to-the-prod-cluster-with-a-very-long-name-42";
    await typeInto("tab-rename", long);
    await browser.keys(["Enter"]);
    await browser.pause(400);

    const title = await browser.execute((id) => {
      const tab = document.querySelector(`[data-testid="tab"][data-tab-id="${id}"]`);
      const label = tab?.querySelector('[data-testid="tab-title"]');
      if (!label) return null;
      const css = getComputedStyle(label);
      return {
        textOverflow: css.textOverflow,
        overflowHidden: css.overflow,
        clipped: (label.scrollWidth ?? 0) > (label.clientWidth ?? 0),
        pageFits: document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0,
      };
    }, tabId!);
    expect(title).not.toBeNull();
    expect(title!.textOverflow).toBe("ellipsis");
    expect(title!.overflowHidden).toBe("hidden");
    expect(title!.clipped).toBe(true);
    expect(title!.pageFits).toBe(true);
  });

  it("the splitter moves the sidebar with the keyboard, clamped at both ends", async () => {
    await windowCommand("set_size", { size: { width: 1100, height: 640 } });
    const handle = await byTestId("splitter");
    await handle.waitForExist({ timeout: 5000 });
    await browser.execute(() => document.querySelector<HTMLElement>('[data-testid="splitter"]')?.focus());

    const widths: number[] = [];
    for (let i = 0; i < 40; i++) await browser.keys(["ArrowLeft"]);
    await browser.pause(700);
    widths.push((await (await byTestId("sidebar")).getSize()).width);
    await overflowOk("sidebar at its minimum");
    for (let i = 0; i < 60; i++) await browser.keys(["ArrowRight"]);
    await browser.pause(700);
    widths.push((await (await byTestId("sidebar")).getSize()).width);
    await overflowOk("sidebar at its maximum");

    expect(widths[0]).toBeLessThan(widths[1]!);
    expect(widths[0]).toBeGreaterThanOrEqual(160);
    expect(widths[1]).toBeLessThanOrEqual(600);
  });
});
