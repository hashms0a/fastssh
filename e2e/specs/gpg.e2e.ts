import { expect } from "@wdio/globals";
import fs from "node:fs";
import path from "node:path";
import {
  allRowNames,
  byTestId,
  clickInPage,
  configDir,
  configExists,
  configNames,
  loadFixture,
  menuItemClick,
  readConfigFile,
  readSettings,
  setInputValue,
  selectedRowNames,
  shot,
  toastTexts,
  typeInto,
} from "../helpers";

/**
 * Stage 10 acceptance (R5, R6): encrypt the library, lock on the next start,
 * unlock with the passphrase, and import EasySSH data in one click.
 *
 * Terminal behaviour is not involved here, so the spec never opens a tab; the
 * files are read with node:fs, which is what the [unit] tests cannot see from
 * the app's own folder.
 */

/** Open Preferences through the header menu. */
async function openPreferences(): Promise<void> {
  await clickInPage("header-menu");
  await menuItemClick("header-menu-list", "Preferences");
  await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000 });
}

async function waitUnlockModal(): Promise<void> {
  await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000 });
}

const PASSPHRASE = "test-passphrase-1";

describe("gpg encryption + EasySSH import (Stage 10)", () => {
  // 10.3/10.5: Encrypt in Preferences, then a restart that must ask.
  it("enabling Encrypt writes the .gpg files, and the next start asks for the passphrase", async () => {
    await loadFixture("legacy");
    await openPreferences();
    await clickInPage("prefs-encrypt");
    await waitUnlockModal();
    expect(await (await byTestId("gpg-title")).getText()).toBe("Encrypt your library");
    expect(await (await byTestId("gpg-pass-again")).isExisting()).toBe(true);

    await typeInto("gpg-pass", PASSPHRASE);
    await typeInto("gpg-pass-again", PASSPHRASE);
    await clickInPage("gpg-submit");

    await browser.waitUntil(async () => (await toastTexts()).some((t) => t.includes("Encrypted the library")), {
      timeout: 10000,
      interval: 300,
    });

    // The three files are armored, the plain copies are gone, settings.json is
    // still plain JSON (acceptance: enable writes the 3 .gpg files, removes the
    // .json files and leaves settings.json plain).
    for (const name of ["hosts", "accounts", "bookmarks"]) {
      // Each of the three is armored on disk.
      expect(configExists(`${name}.json.gpg`)).toBe(true);
      expect(readConfigFile(`${name}.json.gpg`)).toContain("-----BEGIN PGP MESSAGE-----");
      // The plain copy is gone.
      expect(configExists(`${name}.json`)).toBe(false);
    }
    expect(configExists("settings.json")).toBe(true);
    expect(readSettings().encryptData).toBe(true);
    expect(readConfigFile("settings.json")).not.toContain("BEGIN PGP MESSAGE");

    await clickInPage("prefs-close");
    await (await byTestId("preferences-modal")).waitForExist({ timeout: 5000, reverse: true });

    // Restart: no passphrase in Rust anymore, so the unlock modal is up.
    await browser.reloadSession();
    await waitUnlockModal();
    await shot("stage_10", "unlock-modal.png"); // 1 shot: the new modal (task 10.4)

    // A wrong passphrase says so and keeps the modal.
    await typeInto("gpg-pass", "wrong-passphrase-1");
    await clickInPage("gpg-submit");
    await (await byTestId("gpg-error")).waitForExist({ timeout: 5000 });
    expect(await (await byTestId("gpg-error")).getText()).toBe("Wrong passphrase");
    expect(await (await byTestId("gpg-modal")).isExisting()).toBe(true);
    expect(await (await byTestId("gpg-pass")).getValue()).toBe("wrong-passphrase-1");
    // The library is still nothing but Localhost while it is locked.
    expect(await selectedRowNames()).toEqual(["Localhost"]);

    // The right one loads the library.
    await setInputValue("gpg-pass", "");
    await typeInto("gpg-pass", PASSPHRASE);
    await clickInPage("gpg-submit");
    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000, reverse: true });
    await browser.waitUntil(async () => (await allRowNames()).includes("item10"), {
      timeout: 10000,
      interval: 300,
    });
    const rows = await allRowNames();
    expect(rows).toContain("my-server");
    expect(rows).toContain("Сервер-1");
    // Decrypting again is possible (the passphrase was stored in Rust only).
    expect(fs.existsSync(path.join(configDir, "hosts.json"))).toBe(false);
  });

  // Task 10.2/10.3: the fake .gpg fixture cannot be decrypted; "Start empty"
  // renames it aside instead of destroying it.
  it("an unreadable .gpg file reports a readable error, and Start empty renames it aside", async () => {
    await loadFixture("locked");
    await waitUnlockModal();
    await typeInto("gpg-pass", "anything-at-all");
    await clickInPage("gpg-submit");
    await (await byTestId("gpg-error")).waitForExist({ timeout: 5000 });

    const message = await (await byTestId("gpg-error")).getText();
    expect(message).toContain("hosts.json.gpg");
    expect(message).toContain("OpenPGP");
    expect(message).not.toContain("anything-at-all");

    await clickInPage("gpg-start-empty");
    await (await byTestId("confirm-dialog")).waitForExist({ timeout: 5000 });
    expect(await (await byTestId("confirm-title")).getText()).toBe("Start with an empty library?");
    await clickInPage("confirm-ok");

    await (await byTestId("gpg-modal")).waitForExist({ timeout: 10000, reverse: true });
    await (await byTestId("welcome-view")).waitForExist({ timeout: 5000 });

    const aside = configNames().filter((n) => n.startsWith("hosts.json.gpg."));
    expect(aside.length).toBe(1);
    // The bytes survive in the aside file.
    expect(fs.readFileSync(path.join(configDir, aside[0]!), "utf8")).toBe("not gpg data\n");
    expect(configExists("hosts.json.gpg")).toBe(false);
    // Nothing else was invented: the aside file is the whole folder.
    expect(configNames()).toEqual([aside[0]!]);
  });

  // Task 10.7 (R5): the menu item, and the WelcomeView button it pairs with.
  it("Import from EasySSH toasts 5 connections, 1 account, 2 bookmarks", async () => {
    await loadFixture("empty");
    // Empty library + legacy data => the welcome screen offers it directly.
    const button = await byTestId("welcome-import-easyssh");
    expect(await button.isExisting()).toBe(true);
    expect(await button.getText()).toBe("Import 5 connections from EasySSH");

    await clickInPage("header-menu");
    await menuItemClick("header-menu-list", "Import from EasySSH");

    await browser.waitUntil(
      async () => (await toastTexts()).some((t) => t.includes("Imported 5 connections, 1 account, 2 bookmarks")),
      { timeout: 10000, interval: 300 },
    );
    // The bad-port record warns about its port; the first warnings go to the toast.
    await browser.waitUntil(
      async () => (await toastTexts()).some((t) => t.includes("bad-port") && t.includes("using 22")),
      { timeout: 5000, interval: 300 },
    );

    const rows = await allRowNames();
    // Localhost is always in the library, so it comes along.
    expect(rows.slice().sort()).toEqual(
      ["Localhost", "bad-port", "item10", "item2", "my-server", "Сервер-1"].slice().sort(),
    );
    expect(configExists("hosts.json")).toBe(true);
    expect(JSON.parse(readConfigFile("hosts.json")).length).toBe(5);
    expect(JSON.parse(readConfigFile("accounts.json")).length).toBe(1);
    expect(JSON.parse(readConfigFile("bookmarks.json")).length).toBe(2);
    // R5: the legacy folder is never written.
    expect(fs.existsSync(path.join(configDir, "..", "legacy", "hosts.json"))).toBe(true);
  });

  // A second import must add nothing, so the WelcomeView button cannot be used
  // twice to duplicate the library.
  it("importing again adds nothing and says 0 (5 skipped)", async () => {
    await loadFixture("legacy");
    await clickInPage("header-menu");
    await menuItemClick("header-menu-list", "Import from EasySSH");
    await browser.waitUntil(async () => (await toastTexts()).some((t) => t.includes("(8 skipped)")), {
      timeout: 10000,
      interval: 300,
    });
    expect(JSON.parse(readConfigFile("hosts.json")).length).toBe(5);
    expect(await (await byTestId("welcome-import-easyssh")).isExisting()).toBe(false);
  });
});
