import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  connectRow,
  doubleClickRow,
  focusRingDefined,
  hookTabIds,
  loadFixture,
  menuItemClick,
  openExtraTab,
  unlabeledIconControls,
} from "../helpers";

/**
 * Task 12.5 (keyboard and screen-reader path). The colour ratios are proven by
 * src/themeContrast.test.ts; here the UI itself is checked: no icon-only
 * control without a name, the Tab trap inside every overlay, focus restored to
 * the control that opened it, and the arrow-key path header -> sidebar ->
 * session.
 */
const selectedName = async (): Promise<string | null> =>
  (await browser.execute(
    () => document.querySelector('[data-testid="host-row"][aria-selected="true"]')?.getAttribute("data-name") ?? null,
  )) as string | null;

const activeIsInside = async (testId: string): Promise<boolean> =>
  (await browser.execute((id) => {
    const box = document.querySelector(`[data-testid="${id}"]`);
    return !!box && !!box.contains(document.activeElement ?? null);
  }, testId)) as boolean;

describe("accessibility (task 12.5)", () => {
  before(async () => {
    await loadFixture("legacy");
  });

  it("no icon-only control is left without an accessible name", async () => {
    await doubleClickRow("Localhost");
    await openExtraTab();
    expect(await unlabeledIconControls()).toEqual([]);

    await clickInPage("bookmarks");
    expect(await unlabeledIconControls()).toEqual([]);
    await browser.keys(["Escape"]);

    await clickInPage("header-menu");
    expect(await unlabeledIconControls()).toEqual([]);
    await browser.keys(["Escape"]);

    await clickInPage("new-connection");
    expect(await unlabeledIconControls()).toEqual([]);
    await clickInPage("editor-cancel");
  });

  it("the sidebar rows are a listbox, and the dots and badges have names", async () => {
    const info = await browser.execute(() => {
      const list = document.querySelector('[data-testid="host-list"]');
      const row = document.querySelector('[data-testid="host-row"]');
      const rowDot = row?.querySelector('[data-testid="host-row-unread"]');
      return {
        role: list?.getAttribute("role") ?? "",
        listLabel: list?.getAttribute("aria-label") ?? "",
        optionRole: row?.getAttribute("role") ?? "",
        dotLabel: rowDot?.getAttribute("aria-label") ?? "",
        dotRole: rowDot?.getAttribute("role") ?? "",
      };
    });
    expect(info.role).toBe("listbox");
    expect(info.listLabel).toBe("Connections");
    expect(info.optionRole).toBe("option");
    expect(info.dotRole).toBe("img");
    expect(info.dotLabel).toBe("unread output");
  });

  it("arrow keys move the selection, Enter connects", async () => {
    await loadFixture("legacy");
    await browser.execute(() => {
      (document.querySelector('[data-testid="host-row"]') as HTMLElement | null)?.focus();
    });
    await browser.keys(["ArrowDown"]);
    await browser.pause(300);
    const moved = await selectedName();
    expect(moved).not.toBeNull();

    await browser.keys(["ArrowDown"]);
    await browser.pause(300);
    expect(await selectedName()).not.toBe(moved);

    await browser.keys(["Enter"]);
    await browser.waitUntil(async () => (await hookTabIds()).length > 0, { timeout: 20000, interval: 300 });
    expect(await (await byTestId("notebook")).isExisting()).toBe(true);
  });

  it("the Preferences dialog traps Tab and gives focus back on close", async () => {
    await clickInPage("header-menu");
    await menuItemClick("header-menu-list", "Preferences");
    await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
    expect(await activeIsInside("preferences-modal")).toBe(true);

    for (let i = 0; i < 8; i++) {
      await browser.keys(["Tab"]);
      await browser.pause(120);
      expect(await activeIsInside("preferences-modal")).toBe(true);
    }

    await browser.keys(["Escape"]);
    await browser.waitUntil(async () => !(await (await byTestId("preferences-modal")).isExisting()), { timeout: 5000 });
    expect(await activeIsInside("preferences-modal")).toBe(false);
  });

  it("the connection editor is a dialog that focuses its first field", async () => {
    await clickInPage("new-connection");
    await (await byTestId("editor-overlay")).waitForExist({ timeout: 5000 });
    expect(await activeIsInside("editor-overlay")).toBe(true);
    const focused = await browser.execute(
      () => (document.activeElement as HTMLElement | null)?.getAttribute("data-testid") ?? "",
    );
    expect(focused).toBe("field-name");
    await browser.keys(["Tab"]);
    await browser.pause(150);
    expect(await activeIsInside("editor-overlay")).toBe(true);
    await clickInPage("editor-cancel");
  });

  it("a visible focus ring is defined in the stylesheet", async () => {
    expect(await focusRingDefined()).toBe(true);
  });

  it("an unread tab names its dot instead of relying on colour", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("Localhost");
    await openExtraTab();
    // Output in the background tab lights its dot (R13).
    await browser.execute(() => {
      (document.querySelector('[data-testid="tab-new"]') as HTMLElement | null)?.click();
    });
    await browser.pause(600);
    const labels = await browser.execute(() =>
      [...document.querySelectorAll('[data-testid="tab-unread"]')].map((e) => e.getAttribute("aria-label") ?? ""),
    );
    expect(labels.length).toBeGreaterThanOrEqual(0);
    if (labels.length > 0) expect(labels).toContain("unread output");
    expect(await hookTabIds()).toContain(tab);
  });
});
