import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  clickRow,
  connectRow,
  domTabIds,
  expectPrompt,
  focusTerm,
  hookTabIds,
  loadFixture,
  menuItemClick,
  openedHostsFromDisk,
  openExtraTab,
  readSettings,
  selectedRowNames,
} from "../helpers";

/**
 * Stage 11 (P3) acceptance: the new setting reopens the Localhost tabs of the
 * previous run. Stage 8 deliberately never restored them, so this is the only
 * place a local shell survives a quit. No sshd container is needed.
 */

async function openPreferences(): Promise<void> {
  await clickInPage("header-menu");
  await menuItemClick("header-menu-list", "Preferences");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

async function closePreferences(): Promise<void> {
  await clickInPage("prefs-close");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000, reverse: true });
}

/** Ctrl+Q inside the webview; the driver reports a dead session, which IS the quit. */
async function pressCtrlQ(): Promise<void> {
  const tabId = (await hookTabIds()).slice(-1)[0] ?? "";
  if (tabId) await focusTerm(tabId);
  try {
    await browser.keys(["Control", "q"]);
  } catch {
    /* expected: the window closed under the keystroke */
  }
  await browser.pause(1500);
}

/** Turn both restore switches on in Preferences. */
async function restoreBoth(local: boolean): Promise<void> {
  await openPreferences();
  await clickInPage("prefs-restore-hosts");
  if (local) await clickInPage("prefs-restore-local");
  await closePreferences();
}

describe("restore local shells (Stage 11, P3)", () => {
  it("Restore local shells is disabled until Restore hosts is on", async () => {
    await loadFixture("legacy");
    await openPreferences();
    expect(await (await byTestId("prefs-restore-local")).getAttribute("disabled")).not.toBeNull();
    await clickInPage("prefs-restore-hosts");
    expect(await (await byTestId("prefs-restore-local")).getAttribute("disabled")).toBeNull();
    await closePreferences();
  });

  it("with the setting on, the Localhost tabs of the last run come back", async () => {
    await loadFixture("legacy");
    await restoreBoth(true);
    expect(readSettings()["restoreLocalhost"]).toBe(true);

    await clickRow("Localhost");
    await connectRow("Localhost");
    await openExtraTab();
    await browser.waitUntil(async () => (await domTabIds()).length === 2, { timeout: 15000, interval: 300 });

    await pressCtrlQ();
    expect(openedHostsFromDisk()).toEqual([{ hostName: "Localhost", tabCount: 2 }]);

    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist({ timeout: 15000 });
    await browser.waitUntil(async () => (await domTabIds()).length === 2, { timeout: 25000, interval: 400 });
    expect(await selectedRowNames()).toEqual(["Localhost"]);
    // Both are real shells, not placeholders: each answers a command.
    const ids = await hookTabIds();
    await expectPrompt(ids[0]!, process.env.USER ?? "dev");
    await expectPrompt(ids[1]!, process.env.USER ?? "dev");
    // The list is cleared, so a crash before the next quit does not restore twice.
    await browser.waitUntil(async () => openedHostsFromDisk().length === 0, { timeout: 10000, interval: 400 });
  });

  it("with the setting off, a Localhost-only run restores nothing", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-restore-hosts"); // Restore on, local shells off
    await closePreferences();
    expect(readSettings()["restoreLocalhost"]).toBeFalsy();

    await clickRow("Localhost");
    await connectRow("Localhost");
    await openExtraTab();
    await browser.waitUntil(async () => (await domTabIds()).length === 2, { timeout: 15000, interval: 300 });

    await pressCtrlQ();
    expect(openedHostsFromDisk()).toEqual([]);

    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist({ timeout: 15000 });
    await browser.pause(1200); // a restore would have started by now
    expect((await domTabIds()).length).toBe(0);
  });
});
