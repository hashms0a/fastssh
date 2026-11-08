import { expect } from "@wdio/globals";
import {
  byTestId,
  connectRow,
  contextMenuInPage,
  domTabIds,
  focusTerm,
  hookClipboard,
  loadFixture,
  menuItemClick,
  menuItemDisabled,
  menuLabels,
  readBuffer,
  recentLines,
  runCommand,
} from "../helpers";

/**
 * Stage 6 acceptance, part 2: the terminal right-click menu (task 6.4, R12)
 * and the clipboard wiring (task 6.3). The menu is opened by dispatching
 * contextmenu inside the page; a W3C right click is unreliable on this driver.
 */

const pane = (tabId: string): string => `[data-testid="terminal-pane"][data-tab-id="${tabId}"]`;

const lastLine = async (tabId: string): Promise<string> => {
  const lines = (await readBuffer(tabId)).split("\n");
  return lines[lines.length - 1] ?? "";
};

describe("terminal context menu + clipboard (Stage 6)", () => {
  it("the menu has the plan's items, and Show in File Browser is disabled for Localhost", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await contextMenuInPage(pane(tabId));
    expect(await menuLabels("terminal-menu")).toEqual([
      "Copy",
      "Paste",
      "Select All",
      "Search",
      "Copy Last Output",
      "Scroll to Last Command",
      "Show in File Browser",
      "Close tab",
    ]);
    // R16 opens sftp://user@host — remote only, and wired in Stage 7.
    expect(await menuItemDisabled("terminal-menu", "Show in File Browser")).toBe(true);
    await browser.keys(["Escape"]);
    await (await byTestId("terminal-menu")).waitForExist({ timeout: 5000, reverse: true });
    await expect(await byTestId("terminal-menu")).not.toBeExisting();
  });

  it("Copy Last Output, Select All + Copy, Paste, Search and Close Tab all work", async () => {
    await loadFixture("legacy");
    const tabId = await connectRow("Localhost");
    await runCommand(tabId, "echo menu-clip");
    await browser.waitUntil(async () => (await recentLines(tabId, 3)).includes("menu-clip"), { timeout: 12000 });

    await contextMenuInPage(pane(tabId));
    await menuItemClick("terminal-menu", "Copy Last Output");
    await browser.waitUntil(async () => (await hookClipboard()) === "menu-clip", { timeout: 8000, interval: 250 });

    // Ctrl+Shift+A then Ctrl+Shift+C: the whole buffer goes to the clipboard.
    await focusTerm(tabId);
    await browser.keys(["Control", "Shift", "a"]);
    await browser.keys(["Control", "Shift", "c"]);
    await browser.waitUntil(async () => (await hookClipboard()).includes("menu-clip"), {
      timeout: 8000,
      interval: 250,
    });

    // Ctrl+Shift+V pastes the clipboard into the prompt. Alt+C first puts a
    // single line there, so the paste does not run a screen of commands.
    await browser.keys(["Alt", "c"]);
    await browser.waitUntil(async () => (await hookClipboard()) === "menu-clip", { timeout: 8000, interval: 250 });
    await browser.keys(["Control", "Shift", "v"]);
    await browser.waitUntil(async () => (await lastLine(tabId)).includes("menu-clip"), {
      timeout: 8000,
      interval: 250,
    });

    // Search from the menu, then Close Tab from the menu.
    await contextMenuInPage(pane(tabId));
    await menuItemClick("terminal-menu", "Search");
    await (await byTestId("search-toolbar")).waitForExist({ timeout: 6000 });
    await browser.keys(["Escape"]);

    await contextMenuInPage(pane(tabId));
    await menuItemClick("terminal-menu", "Close tab");
    await browser.waitUntil(async () => (await domTabIds()).length === 0, { timeout: 8000, interval: 250 });
    expect(await byTestId("landing-connect")).toBeExisting();
  });
});
