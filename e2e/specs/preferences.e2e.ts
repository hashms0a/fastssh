import { expect } from "@wdio/globals";
import {
  byTestId,
  clickInPage,
  clickRow,
  connectRow,
  domTabIds,
  expectPrompt,
  focusTerm,
  hookAppearance,
  hookBufferLength,
  hookRows,
  hookTabIds,
  htmlClasses,
  loadFixture,
  menuItemClick,
  openedHostsFromDisk,
  openExtraTab,
  readSettings,
  requestWindowClose,
  runCommand,
  selectedRowNames,
  setInputValue,
  setFieldValue,
  shot,
} from "../helpers";

/**
 * Stage 8 acceptance (R18, R19): the Preferences modal applies itself to the
 * running app, and the quit flow + restore round-trip the open tabs through
 * settings.json. Ctrl+Q ends the app, so it is pressed in the last tests
 * only, and every test restarts the app with loadFixture first.
 */

/** Open Preferences through the header menu. */
async function openPreferences(): Promise<void> {
  await clickInPage("header-menu");
  await menuItemClick("header-menu-list", "Preferences");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

async function closePreferences(): Promise<void> {
  await clickInPage("prefs-close");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000, reverse: true });
}

/** Answer any fingerprint question that is up (restore can queue several). */
async function acceptFingerprints(max = 4): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (!(await (await byTestId("fingerprint-modal")).isExisting())) return;
    await clickInPage("fingerprint-yes");
    await browser.pause(300);
  }
}

/** Ctrl+Q inside the webview. The app exits while the key action is still in
 *  flight, so the driver reports a dead session - that error IS the quit. */
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

describe("preferences, restore and quit (Stage 8)", () => {
  it("the Dark theme switch changes the <html> class at once", async () => {
    await loadFixture("legacy");
    await openPreferences();
    expect(await htmlClasses()).toContain("dark"); // the default is dark

    await clickInPage("prefs-tab-appearance");
    await clickInPage("prefs-dark-theme");
    await browser.waitUntil(async () => !(await htmlClasses()).includes("dark"), { timeout: 5000, interval: 200 });
    await shot("stage_08", "preferences.png"); // 1 shot: the Appearance tab, light theme

    await clickInPage("prefs-dark-theme");
    await browser.waitUntil(async () => (await htmlClasses()).includes("dark"), { timeout: 5000, interval: 200 });
    await closePreferences();
    // Escape and Close both leave the overlay; the app is still running.
    expect(await (await byTestId("header-bar")).isExisting()).toBe(true);
  });

  it("font, size, background and scrollback apply to open tabs, host overrides stay", async () => {
    await loadFixture("legacy");
    const local = await connectRow("Localhost");
    const item10 = await connectRow("item10"); // item10 has font "Monospace 11" + its own color
    await acceptFingerprints();
    await expectPrompt(item10, "tester");

    await openPreferences();
    await clickInPage("prefs-tab-appearance");

    await setFieldValue("prefs-font-size", "18");
    await browser.keys(["Enter"]);
    await setFieldValue("prefs-font-family", "DejaVu Sans Mono");
    await browser.keys(["Enter"]);
    await setInputValue("prefs-bg-color", "#00ff00");
    await setFieldValue("prefs-scrollback", "2000");
    await browser.keys(["Enter"]);

    await browser.waitUntil(
      async () => {
        const look = await hookAppearance(local);
        return (
          look !== null &&
          look.fontSize === 18 &&
          look.fontFamily === "DejaVu Sans Mono" &&
          look.background === "#00ff00" &&
          look.scrollback === 2000
        );
      },
      { timeout: 10000, interval: 300 },
    );

    // R12: the host's own font and color beat the new global values.
    const own = await hookAppearance(item10);
    expect(own?.fontFamily).toBe("Monospace");
    expect(own?.fontSize).toBe(11);
    expect(own?.background).toBe("#002b36");
    expect(own?.scrollback).toBe(2000);

    // Reset puts the default background back without a restart.
    await clickInPage("prefs-bg-reset");
    await browser.waitUntil(async () => (await hookAppearance(local))?.background === "#1e1e1e", {
      timeout: 5000,
      interval: 300,
    });
    await closePreferences();
  });

  it("scrollback 1000 caps the buffer of a 5000-line output", async () => {
    await loadFixture("legacy");
    const tab = await connectRow("Localhost");
    await openPreferences();
    await clickInPage("prefs-tab-appearance");
    await setFieldValue("prefs-scrollback", "1000");
    await browser.keys(["Enter"]);
    await closePreferences();
    expect((await hookAppearance(tab))?.scrollback).toBe(1000);

    await runCommand(tab, "seq 1 5000");
    await browser.waitUntil(async () => (await hookBufferLength(tab)) > 1000, { timeout: 20000, interval: 400 });
    const rows = await hookRows(tab);
    expect(await hookBufferLength(tab)).toBeLessThanOrEqual(1000 + rows);
  });

  it("the window close request also writes openedHosts", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-restore-hosts");
    await closePreferences();

    await connectRow("Localhost"); // never restored (Stage 8 Notes)
    const remote = await connectRow("item2");
    await acceptFingerprints();
    await expectPrompt(remote, "keyuser");

    await requestWindowClose();
    expect(openedHostsFromDisk()).toEqual([{ hostName: "item2", tabCount: 1 }]);
    // The saved file is still complete JSON.
    expect(readSettings()).toHaveProperty("windowWidth");
  });

  it("Ctrl+Q saves the open tabs and the restart reopens them", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-restore-hosts");
    await closePreferences();

    const first = await connectRow("item2");
    await acceptFingerprints();
    await expectPrompt(first, "keyuser");
    await openExtraTab(); // a second tab on the selected host (item2)
    const item10 = await connectRow("item10");
    await acceptFingerprints();
    await expectPrompt(item10, "tester");
    expect(await domTabIds()).toHaveLength(3);

    await pressCtrlQ();
    expect(openedHostsFromDisk()).toEqual([
      { hostName: "item2", tabCount: 2 },
      { hostName: "item10", tabCount: 1 },
    ]);

    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist({ timeout: 15000 });
    await browser.waitUntil(async () => (await domTabIds()).length === 3, { timeout: 25000, interval: 400 });
    await acceptFingerprints();
    // The list is cleared, so a crash before the next quit does not restore twice.
    await browser.waitUntil(async () => openedHostsFromDisk().length === 0, { timeout: 10000, interval: 400 });
    // The first restored host is the one in front (task 8.5): item2 was
    // saved first, so its notebook is selected and its row is the marked one.
    await browser.waitUntil(async () => (await selectedRowNames()).includes("item2"), {
      timeout: 10000,
      interval: 400,
    });
    expect(await selectedRowNames()).toEqual(["item2"]);
    // Both notebooks are back with their tabs.
    await browser.waitUntil(async () => (await domTabIds()).length === 3, { timeout: 15000, interval: 500 });
  });

  it("with Restore off, a quit opens nothing on the next start", async () => {
    await loadFixture("legacy"); // the legacy set has no settings.json -> default off
    expect((await htmlClasses()).length).toBeGreaterThan(0);
    const tab = await connectRow("item2");
    await acceptFingerprints();
    await expectPrompt(tab, "keyuser");

    await pressCtrlQ();
    expect(openedHostsFromDisk()).toEqual([]);

    await browser.reloadSession();
    await (await byTestId("header-bar")).waitForExist({ timeout: 15000 });
    await browser.pause(1200); // a restore would have started by now
    expect(await domTabIds()).toHaveLength(0);
    await clickRow("Localhost");
    expect(await domTabIds()).toHaveLength(0);
  });
});
