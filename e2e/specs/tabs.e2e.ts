import { expect } from "@wdio/globals";
import fs from "node:fs";
import path from "node:path";
import {
  byTestId,
  clickRow,
  configDir,
  connectRow,
  domTabIds,
  hookTabIds,
  loadFixture,
  openExtraTab,
  shot,
  typeInto,
} from "../helpers";

/**
 * Stage 11 (P2) acceptance: drag a tab onto another tab to reorder the
 * notebook, and double-click a tab to rename it. Only the Local Shell is
 * needed, so this spec runs with the sshd container stopped.
 *
 * The drag is dispatched inside the page (a W3C pointer drag starts no HTML5
 * drag here), and titles are read from the tab rows' data-title.
 */

const titleOf = async (tabId: string): Promise<string> => {
  const value = await $(`[data-testid="tab"][data-tab-id="${tabId}"]`).getAttribute("data-title");
  return value ?? "";
};

async function dragTab(from: string, to: string): Promise<void> {
  await browser.execute((a) => {
    document
      .querySelector(`[data-testid="tab"][data-tab-id="${a}"]`)
      ?.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
  }, from);
  await browser.pause(150); // let the notebook record what is being dragged
  await browser.execute((b) => {
    const el = document.querySelector(`[data-testid="tab"][data-tab-id="${b}"]`);
    el?.dispatchEvent(new DragEvent("dragover", { bubbles: true }));
    el?.dispatchEvent(new DragEvent("drop", { bubbles: true }));
  }, to);
  await browser.pause(200);
  await browser.execute((a) => {
    document
      .querySelector(`[data-testid="tab"][data-tab-id="${a}"]`)
      ?.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
  }, from);
  await browser.pause(200);
}

async function startRename(id: string): Promise<void> {
  await browser.execute((a) => {
    const el = document.querySelector(`[data-testid="tab"][data-tab-id="${a}"]`);
    // WebKit only fires React's onDoubleClick for a dblclick that carries a
    // view and a click count (a bare MouseEvent('dblclick') reaches nothing).
    el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window, detail: 2 }));
  }, id);
  await (await byTestId("tab-rename")).waitForExist({ timeout: 5000 });
  await browser.pause(150);
}

async function endRename(): Promise<void> {
  await (await byTestId("tab-rename")).waitForExist({ timeout: 5000, reverse: true });
}

/** Three local shell tabs on Localhost, in open order. */
async function threeTabs(): Promise<[string, string, string]> {
  await clickRow("Localhost");
  await connectRow("Localhost");
  await openExtraTab();
  await openExtraTab();
  await browser.waitUntil(async () => (await hookTabIds()).length === 3, { timeout: 15000, interval: 250 });
  const ids = await hookTabIds();
  return [ids[0]!, ids[1]!, ids[2]!];
}

describe("tab reorder and rename (Stage 11, P2)", () => {
  it("dragging a tab onto another tab moves it to that slot", async () => {
    await loadFixture("legacy");
    const [a, b, c] = await threeTabs();

    await dragTab(c, a);
    expect(await hookTabIds()).toEqual([c, a, b]);
    // The tab in front is still the tab that was in front before the drag.
    expect(await browser.execute(() => window.__fastsshTest?.activeTabId() ?? null)).toBe(c);

    await dragTab(c, b);
    expect(await hookTabIds()).toEqual([a, b, c]);
    expect((await domTabIds()).length).toBe(3);
  });

  it("a drop on the tab itself changes nothing", async () => {
    await loadFixture("legacy");
    const ids = await threeTabs();
    await dragTab(ids[0], ids[0]);
    expect(await hookTabIds()).toEqual(ids);
  });

  it("a double-click renames one tab and leaves the other titles alone", async () => {
    await loadFixture("legacy");
    const ids = await threeTabs();

    await startRename(ids[0]);
    expect(await (await byTestId("tab-rename")).getValue()).toBe("Localhost");
    await shot("stage_11", "tab-rename.png"); // the inline field is new UI
    await typeInto("tab-rename", "build box");
    await browser.keys(["Enter"]);
    await endRename();

    expect(await titleOf(ids[0])).toBe("build box");
    expect(await titleOf(ids[1])).toBe("Localhost (2)");
    expect(await titleOf(ids[2])).toBe("Localhost (3)");
    expect(await hookTabIds()).toEqual(ids); // a rename never reorders
  });

  it("Escape cancels the rename, and an empty title keeps the old one", async () => {
    await loadFixture("legacy");
    const [a] = await threeTabs();

    await startRename(a);
    await typeInto("tab-rename", "tmp name");
    await browser.keys(["Escape"]);
    await endRename();
    expect(await titleOf(a)).toBe("Localhost");

    await startRename(a);
    await typeInto("tab-rename", "   ");
    await browser.keys(["Enter"]);
    await endRename();
    expect(await titleOf(a)).toBe("Localhost");
  });

  it("the new title is on the tab only: nothing on disk mentions it", async () => {
    await loadFixture("legacy");
    const [a] = await threeTabs();
    await startRename(a);
    await typeInto("tab-rename", "Scratch-Only-Title");
    await browser.keys(["Enter"]);
    expect(await titleOf(a)).toBe("Scratch-Only-Title");

    // No library or settings file gained the title.
    for (const name of fs.readdirSync(configDir)) {
      expect(fs.readFileSync(path.join(configDir, name), "utf8")).not.toContain("Scratch-Only-Title");
    }
    // A restart has no tabs at all: tabs are session state (Stage 8).
    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist({ timeout: 15000 });
    expect((await domTabIds()).length).toBe(0);
  });
});
